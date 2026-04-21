type GoalMetricShape = {
  current: number;
  target: number;
  periodicity: string;
};

export function calculateGoalProjection(goal: GoalMetricShape, now = new Date()) {
  const currentValue = Number(goal.current || 0);

  if (goal.periodicity === 'daily') {
    const workStart = 8;
    const workEnd = 19;
    const hoursInDay = workEnd - workStart;
    const hoursNow = now.getHours() + now.getMinutes() / 60;
    const hoursPassed = Math.min(Math.max(hoursNow - workStart, 0), hoursInDay);
    const hourlyRate = hoursPassed > 0 ? currentValue / hoursPassed : 0;
    return hourlyRate * hoursInDay;
  }

  if (goal.periodicity === 'weekly') {
    const day = now.getDay();
    const daysInWeek = 7;
    const daysPassed = day === 0 ? 7 : day;
    const dailyRate = daysPassed > 0 ? currentValue / daysPassed : 0;
    return dailyRate * daysInWeek;
  }

  if (goal.periodicity === 'monthly') {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysPassed = Math.min(now.getDate(), daysInMonth);
    const dailyRate = daysPassed > 0 ? currentValue / daysPassed : 0;
    return dailyRate * daysInMonth;
  }

  return currentValue;
}

export function calculateGoalRemaining(goal: Pick<GoalMetricShape, 'current' | 'target'>) {
  const targetValue = Number(goal.target || 0);
  const currentValue = Number(goal.current || 0);
  return Math.max(targetValue - currentValue, 0);
}
