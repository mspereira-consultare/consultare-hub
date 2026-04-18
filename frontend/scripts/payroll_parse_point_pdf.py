from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

try:
    from pypdf import PdfReader
except Exception:
    PdfReader = None


TIME_RE = re.compile(r"\b(\d{2}:\d{2})\b")
DATE_RE = re.compile(r"\b(\d{2}/\d{2}/\d{4})\b")
DATE_RANGE_RE = re.compile(r"(\d{2}/\d{2}/\d{4})\s*[^\d]{1,12}\s*(\d{2}/\d{2}/\d{4})", re.IGNORECASE)
EMPLOYEE_RE = re.compile(r"Empregado\s*:\s*-?(\d+)\s+(.+?)\s+Horario\s*:\s*(.+)", re.IGNORECASE)
CPF_RE = re.compile(r"C\.?P\.?F\.?\s*:?\s*([0-9.\-]+)")
DEPARTMENT_RE = re.compile(r"Departamento:\s*(.*?)\s+Cargo:", re.IGNORECASE)
SCHEDULE_TIME_RE = re.compile(r"\b(\d{1,2})(?::(\d{2}))?\s*[Hh]\b|\b(\d{2}):(\d{2})\b")
JUSTIFICATION_KEYWORDS = ("ATESTADO", "DECLARACAO", "DECLARAÇÃO", "FERIAS", "FÉRIAS")
INCONSISTENCY_KEYWORDS = ("INCONSIST", "BATIDAS INVAL", "BATIDA INVAL", "MARCACAO INCORRETA", "MARCAÇÃO INCORRETA")


def parse_br_date(raw: str) -> date:
    day, month, year = [int(part) for part in raw.split("/")]
    return date(year, month, day)


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def time_to_minutes(raw: str) -> int:
    hour, minute = [int(part) for part in raw.split(":")]
    return hour * 60 + minute


def diff_minutes(start: str, end: str) -> int:
    return max(0, time_to_minutes(end) - time_to_minutes(start))


def iso_from_parts(year: int, month: int, day: int) -> str:
    return date(year, month, day).isoformat()


def infer_daily_iso_dates(days: list[int], start: date) -> list[str]:
    current_year = start.year
    current_month = start.month
    previous_day = None
    out = []
    for day_value in days:
        if previous_day is not None and day_value < previous_day:
            current_month += 1
            if current_month > 12:
                current_month = 1
                current_year += 1
        out.append(iso_from_parts(current_year, current_month, day_value))
        previous_day = day_value
    return out


def parse_marks(mark_text: str) -> list[str]:
    return TIME_RE.findall(mark_text or "")


def extract_report_date_range(text: str) -> tuple[date | None, date | None]:
    range_match = DATE_RANGE_RE.search(text or "")
    if range_match:
        return parse_br_date(range_match.group(1)), parse_br_date(range_match.group(2))

    found_dates = DATE_RE.findall(text or "")
    if len(found_dates) >= 2:
        return parse_br_date(found_dates[0]), parse_br_date(found_dates[1])
    return None, None


def resolve_point_date(day_value: int, period_start: date, period_end: date) -> str:
    if period_start.year == period_end.year and period_start.month == period_end.month:
        return iso_from_parts(period_start.year, period_start.month, day_value)

    if day_value >= period_start.day:
        return iso_from_parts(period_start.year, period_start.month, day_value)
    return iso_from_parts(period_end.year, period_end.month, day_value)


def extract_schedule_times(schedule_label: str) -> list[str]:
    times = []
    for match in SCHEDULE_TIME_RE.finditer(schedule_label or ""):
        if match.group(3) is not None:
            hour = int(match.group(3))
            minute = int(match.group(4))
        else:
            hour = int(match.group(1))
            minute = int(match.group(2) or 0)
        times.append(f"{hour:02d}:{minute:02d}")
    return times


def extract_schedule_bounds(schedule_label: str) -> tuple[str | None, str | None]:
    times = extract_schedule_times(schedule_label)
    if not times:
        return None, None
    if len(times) == 1:
        return times[0], None
    if len(times) == 2:
        return times[0], times[1]
    return times[0], None


def build_marks(mark_text: str, journey_text: str) -> list[str]:
    marks = parse_marks(mark_text)
    if marks:
        return marks
    intervals = re.findall(r"(\d{2}:\d{2})-(\d{2}:\d{2})", journey_text or "")
    derived_marks = []
    for start, end in intervals:
        derived_marks.extend([start, end])
    return derived_marks


def parse_worked_minutes(journey_text: str, marks: list[str]) -> int:
    if journey_text:
        intervals = re.findall(r"(\d{2}:\d{2})-(\d{2}:\d{2})", journey_text)
        if intervals:
            return sum(diff_minutes(start, end) for start, end in intervals)
    if len(marks) >= 2:
        total = 0
        for index in range(0, len(marks) - 1, 2):
            total += diff_minutes(marks[index], marks[index + 1])
        return total
    return 0


def parse_page(text: str) -> dict | None:
    lines = [line.rstrip() for line in text.splitlines() if line.strip()]
    if not lines:
        return None

    start_range, end_range = extract_report_date_range(text)

    employee_match = EMPLOYEE_RE.search(text)
    if not employee_match:
        return None
    employee_code = clean(employee_match.group(1))
    employee_name = clean(employee_match.group(2))
    schedule_label = clean(employee_match.group(3))

    cpf_match = CPF_RE.search(text)
    department_match = DEPARTMENT_RE.search(text)
    schedule_start, schedule_end = extract_schedule_bounds(schedule_label)

    employee = {
        "employeeCode": employee_code or None,
        "employeeName": employee_name,
        "employeeCpf": clean(cpf_match.group(1)) if cpf_match else None,
        "department": clean(department_match.group(1)) if department_match else None,
        "scheduleLabel": schedule_label or None,
        "scheduleStart": schedule_start,
        "scheduleEnd": schedule_end,
        "days": [],
    }

    daily_rows = []
    idx = 0
    while idx < len(lines):
        line = lines[idx]
        if not re.match(r"^\d{2}-", line):
            idx += 1
            continue

        continuation_lines = []
        lookahead = idx + 1
        while lookahead < len(lines):
            next_line = lines[lookahead]
            if re.match(r"^\d{2}-", next_line):
                break
            if "|" not in next_line:
                break
            continuation_lines.append(next_line)
            lookahead += 1

        parts = [part.strip() for part in line.split("|")]
        if len(parts) < 3:
            idx = lookahead
            continue
        day_raw = parts[0]
        try:
            day_number = int(day_raw.split("-")[0])
        except Exception:
            idx = lookahead
            continue

        marks_text = parts[1] if len(parts) > 1 else ""
        journey_text = parts[2] if len(parts) > 2 else ""
        combined_text = clean(" ".join([line, *continuation_lines]))
        upper_text = combined_text.upper()
        upper_journey = clean(journey_text).upper()
        marks = build_marks(marks_text, journey_text)
        worked_minutes = parse_worked_minutes(journey_text, marks)
        absence_flag = "FALTOU" in upper_text
        justification_text = None
        if any(token in upper_text for token in JUSTIFICATION_KEYWORDS):
            justification_text = combined_text

        inconsistency_flag = any(token in upper_text for token in INCONSISTENCY_KEYWORDS)

        late_minutes = 0
        if employee["scheduleStart"] and marks and not absence_flag:
            late_minutes = max(0, time_to_minutes(marks[0]) - time_to_minutes(employee["scheduleStart"]))

        daily_rows.append(
            {
                "dayNumber": day_number,
                "marks": marks,
                "rawDayText": combined_text,
                "workedMinutes": worked_minutes,
                "lateMinutes": late_minutes,
                "absenceFlag": absence_flag,
                "inconsistencyFlag": inconsistency_flag,
                "justificationText": justification_text,
            }
        )
        idx = lookahead

    if start_range and end_range and daily_rows:
        for row in daily_rows:
            row["pointDate"] = resolve_point_date(row["dayNumber"], start_range, end_range)
            row.pop("dayNumber", None)
    elif start_range and daily_rows:
        iso_dates = infer_daily_iso_dates([row["dayNumber"] for row in daily_rows], start_range)
        for idx, row in enumerate(daily_rows):
            row["pointDate"] = iso_dates[idx]
            row.pop("dayNumber", None)

    employee["days"] = daily_rows
    return employee


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: payroll_parse_point_pdf.py <pdf_path>")

    if PdfReader is None:
        raise SystemExit("pypdf não está instalado no ambiente atual.")

    pdf_path = Path(sys.argv[1])
    reader = PdfReader(str(pdf_path))
    employees = []
    for page in reader.pages:
      text = page.extract_text() or ""
      parsed = parse_page(text)
      if parsed:
          employees.append(parsed)

    print(json.dumps({"employees": employees}, ensure_ascii=False))


if __name__ == "__main__":
    main()
