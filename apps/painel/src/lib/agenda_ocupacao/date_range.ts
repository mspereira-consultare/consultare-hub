const TIME_ZONE = "America/Sao_Paulo";

const getLocalDateParts = (baseDate: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(baseDate);

  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(byType.get("year") || "1970"),
    month: Number(byType.get("month") || "1"),
  };
};

export const getAgendaOcupacaoDefaultRange = (futureMonths = 2, baseDate = new Date()) => {
  const { year, month } = getLocalDateParts(baseDate);

  let targetYear = year;
  let targetMonth = month + Math.max(0, futureMonths);

  while (targetMonth > 12) {
    targetYear += 1;
    targetMonth -= 12;
  }

  const lastDay = new Date(targetYear, targetMonth, 0).getDate();

  return {
    startDate: `${year}-${String(month).padStart(2, "0")}-01`,
    endDate: `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
};
