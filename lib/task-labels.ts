/** The strings the task editor needs, picked from the translation table so the client component stays small. */
export function taskLabels(t: Record<string, string>) {
  return {
    edit: t.taskEdit, save: t.taskSave, cancel: t.taskCancel, saving: t.taskSaving,
    titleLabel: t.taskTitleLabel, ownerLabel: t.taskOwnerLabel, dueLabel: t.taskDueLabel,
    noOwner: t.noOwner, noDue: t.noDue, clarify: t.dueClarify, unclear: t.dueUnclear,
    heardText: t.heardText, heardDay: t.heardDay, askMonthYear: t.askMonthYear, askDate: t.askDate,
    monthLabel: t.monthLabel, yearLabel: t.yearLabel,
    saveError: t.taskSaveError, conflict: t.taskConflict, invalidDate: t.taskInvalidDate,
  };
}
export type TaskLabels = ReturnType<typeof taskLabels>;
