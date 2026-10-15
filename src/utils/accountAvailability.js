function roundToCents(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sumGoalAllocations(goals = [], accountId) {
  if (!accountId || !Array.isArray(goals)) return 0;

  return roundToCents(
    goals.reduce((sum, goal) => sum + (Number(goal?.reservations?.[accountId]) || 0), 0)
  );
}

function sumSharedGoalAllocations(sharedAccounts = [], accountId) {
  if (!accountId || !Array.isArray(sharedAccounts)) return 0;

  return roundToCents(
    sharedAccounts.reduce((sum, sharedAccount) => {
      const goals = Array.isArray(sharedAccount?.savingsGoals) ? sharedAccount.savingsGoals : [];
      return sum + goals.reduce((goalSum, goal) => goalSum + (Number(goal?.reservations?.[accountId]) || 0), 0);
    }, 0)
  );
}

export function getAccountAvailabilityBreakdown(account, individualGoals = [], sharedAccounts = []) {
  const total = roundToCents(Number(account?.balance) || 0);
  const accountId = account?.id || null;
  const individualAllocated = sumGoalAllocations(individualGoals, accountId);
  const sharedAllocated = sumSharedGoalAllocations(sharedAccounts, accountId);
  const available = Math.max(0, roundToCents(total - individualAllocated - sharedAllocated));

  return {
    total,
    individualAllocated,
    sharedAllocated,
    available,
  };
}
