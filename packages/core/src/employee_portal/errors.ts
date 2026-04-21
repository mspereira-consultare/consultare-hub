import { EmployeePortalError } from './repository';

export const getEmployeePortalErrorStatus = (error: unknown) => {
  if (error instanceof EmployeePortalError) return error.status;
  const status = Number((error as { status?: unknown } | null)?.status || 500);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
};

export const getEmployeePortalErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;
