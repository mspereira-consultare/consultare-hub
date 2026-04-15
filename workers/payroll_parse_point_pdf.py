import json
import re
import sys
from datetime import date
from pathlib import Path

from pypdf import PdfReader


TIME_RE = re.compile(r"\b(\d{2}:\d{2})\b")
DATE_RANGE_RE = re.compile(r"(\d{2}/\d{2}/\d{4})\s*[àA]\s*(\d{2}/\d{2}/\d{4})", re.IGNORECASE)
EMPLOYEE_RE = re.compile(r"Empregado\s*:.*?-(\d+)\s+(.+?)\s+Horario\s*:\s*(.+)", re.IGNORECASE)
CPF_RE = re.compile(r"C\.?P\.?F\.?\s*:?\s*([0-9.\-]+)")
DEPARTMENT_RE = re.compile(r"Departamento:\s*(.*?)\s+Cargo:", re.IGNORECASE)
SCHEDULE_RE = re.compile(r"(\d{2}:\d{2})\s+AS\s+(\d{2}:\d{2})", re.IGNORECASE)


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

    range_match = DATE_RANGE_RE.search(text)
    start_range = parse_br_date(range_match.group(1)) if range_match else None

    employee_match = EMPLOYEE_RE.search(text)
    if not employee_match:
        return None
    employee_code = clean(employee_match.group(1))
    employee_name = clean(employee_match.group(2))
    schedule_label = clean(employee_match.group(3))

    cpf_match = CPF_RE.search(text)
    department_match = DEPARTMENT_RE.search(text)
    schedule_match = SCHEDULE_RE.search(schedule_label)

    employee = {
        "employeeCode": employee_code or None,
        "employeeName": employee_name,
        "employeeCpf": clean(cpf_match.group(1)) if cpf_match else None,
        "department": clean(department_match.group(1)) if department_match else None,
        "scheduleLabel": schedule_label or None,
        "scheduleStart": schedule_match.group(1) if schedule_match else None,
        "scheduleEnd": schedule_match.group(2) if schedule_match else None,
        "days": [],
    }

    daily_rows = []
    for idx, line in enumerate(lines):
        if not re.match(r"^\d{2}-", line):
            continue
        parts = [part.strip() for part in line.split("|")]
        if len(parts) < 3:
            continue
        day_raw = parts[0]
        try:
            day_number = int(day_raw.split("-")[0])
        except Exception:
            continue

        marks_text = parts[1] if len(parts) > 1 else ""
        journey_text = parts[2] if len(parts) > 2 else ""
        raw_text = clean(" | ".join(parts))
        upper_journey = clean(journey_text).upper()
        marks = parse_marks(marks_text)
        worked_minutes = parse_worked_minutes(journey_text, marks)
        absence_flag = "FALTOU" in upper_journey
        justification_text = None
        if any(token in raw_text.upper() for token in ["ATESTADO", "DECLARACAO", "DECLARAÇÃO", "FERIAS", "FÉRIAS"]):
            justification_text = clean(journey_text or raw_text)

        inconsistency_flag = False
        if idx + 1 < len(lines):
            next_line = clean(lines[idx + 1])
            if next_line and not re.match(r"^\d{2}-", next_line) and "INCONSIST" in next_line.upper():
                inconsistency_flag = True

        late_minutes = 0
        if employee["scheduleStart"] and marks and not absence_flag:
            late_minutes = max(0, time_to_minutes(marks[0]) - time_to_minutes(employee["scheduleStart"]))

        daily_rows.append(
            {
                "dayNumber": day_number,
                "marks": marks,
                "rawDayText": raw_text,
                "workedMinutes": worked_minutes,
                "lateMinutes": late_minutes,
                "absenceFlag": absence_flag,
                "inconsistencyFlag": inconsistency_flag,
                "justificationText": justification_text,
            }
        )

    if start_range and daily_rows:
        iso_dates = infer_daily_iso_dates([row["dayNumber"] for row in daily_rows], start_range)
        for idx, row in enumerate(daily_rows):
            row["pointDate"] = iso_dates[idx]
            row.pop("dayNumber", None)

    employee["days"] = daily_rows
    return employee


def parse_pdf_file(pdf_path: str | Path) -> list[dict]:
    reader = PdfReader(str(pdf_path))
    employees = []
    for page in reader.pages:
        text = page.extract_text() or ""
        parsed = parse_page(text)
        if parsed:
            employees.append(parsed)
    return employees


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: payroll_parse_point_pdf.py <pdf_path>")

    employees = parse_pdf_file(sys.argv[1])
    print(json.dumps({"employees": employees}, ensure_ascii=False))


if __name__ == "__main__":
    main()
