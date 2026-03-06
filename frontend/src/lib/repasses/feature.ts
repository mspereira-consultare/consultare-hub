const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export const isRepassesModuleEnabledServer = () => {
  const raw = String(process.env.REPASSES_MODULE_ENABLED || '').trim().toLowerCase();
  return TRUE_VALUES.has(raw);
};

export const isRepassesModuleEnabledClient = () => {
  const raw = String(process.env.NEXT_PUBLIC_REPASSES_MODULE_ENABLED || '').trim().toLowerCase();
  return TRUE_VALUES.has(raw);
};
