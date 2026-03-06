const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

const isEnabledByDefault = (rawValue: string) => {
  const raw = String(rawValue || '').trim().toLowerCase();
  if (!raw) return true;
  if (FALSE_VALUES.has(raw)) return false;
  if (TRUE_VALUES.has(raw)) return true;
  return true;
};

export const isRepassesModuleEnabledServer = () => {
  return isEnabledByDefault(String(process.env.REPASSES_MODULE_ENABLED || ''));
};

export const isRepassesModuleEnabledClient = () => {
  return isEnabledByDefault(String(process.env.NEXT_PUBLIC_REPASSES_MODULE_ENABLED || ''));
};
