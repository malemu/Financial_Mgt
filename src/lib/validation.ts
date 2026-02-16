import { Allocation, Holding, PriceMap } from "./types";

export type ValidationIssue = {
  id: string;
  message: string;
  severity: "warning" | "critical";
};

const formatList = (items: string[]) => items.join(", ");

export const validatePortfolio = (
  allocations: Allocation[],
  holdings: Holding[],
  priceMap: PriceMap
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  const allocationIds = allocations.map((allocation) => allocation.asset_id);
  const holdingIds = holdings.map((holding) => holding.asset_id);
  const duplicateAllocations = allocationIds.filter(
    (item, index) => allocationIds.indexOf(item) !== index
  );
  const duplicateHoldings = holdingIds.filter(
    (item, index) => holdingIds.indexOf(item) !== index
  );

  if (duplicateAllocations.length) {
    issues.push({
      id: "alloc-duplicates",
      message: `Duplicate allocation assets: ${formatList(
        Array.from(new Set(duplicateAllocations))
      )}.`,
      severity: "critical",
    });
  }

  if (duplicateHoldings.length) {
    issues.push({
      id: "holding-duplicates",
      message: `Duplicate holdings assets: ${formatList(
        Array.from(new Set(duplicateHoldings))
      )}.`,
      severity: "warning",
    });
  }

  allocations.forEach((allocation) => {
    if (allocation.target_weight > allocation.max_weight) {
      issues.push({
        id: `alloc-max-${allocation.id}`,
        message: `${allocation.asset_id} target weight exceeds max.`,
        severity: "critical",
      });
    }
    if (!allocation.thesis_summary.trim()) {
      issues.push({
        id: `alloc-thesis-${allocation.id}`,
        message: `${allocation.asset_id} thesis summary is empty.`,
        severity: "warning",
      });
    }
    if (!allocation.kill_criteria.trim()) {
      issues.push({
        id: `alloc-kill-${allocation.id}`,
        message: `${allocation.asset_id} kill criteria is empty.`,
        severity: "warning",
      });
    }
    if (allocation.conviction_tier < 1) {
      issues.push({
        id: `alloc-conviction-${allocation.id}`,
        message: `${allocation.asset_id} conviction tier is missing.`,
        severity: "critical",
      });
    }
  });

  holdings.forEach((holding, index) => {
    if (!holding.asset_id.trim()) {
      issues.push({
        id: `holding-id-${index}`,
        message: `Holding ${index + 1} is missing an asset id.`,
        severity: "critical",
      });
    }
    if (holding.shares < 0 || holding.entry_price < 0 || holding.cost_basis < 0) {
      issues.push({
        id: `holding-negative-${holding.asset_id}-${index}`,
        message: `${holding.asset_id} has negative values.`,
        severity: "critical",
      });
    }
    if (priceMap[holding.asset_id] === undefined) {
      issues.push({
        id: `holding-price-${holding.asset_id}-${index}`,
        message: `${holding.asset_id} missing current price.`,
        severity: "warning",
      });
    }
  });

  const allocationSet = new Set(allocationIds);
  const orphanHoldings = holdingIds.filter((item) => !allocationSet.has(item));
  if (orphanHoldings.length) {
    issues.push({
      id: "orphan-holdings",
      message: `Holdings without allocation: ${formatList(
        Array.from(new Set(orphanHoldings))
      )}.`,
      severity: "critical",
    });
  }

  const totalWeight = allocations.reduce(
    (sum, allocation) => sum + allocation.target_weight,
    0
  );
  if (totalWeight < 95 || totalWeight > 105) {
    issues.push({
      id: "alloc-total",
      message: `Target weights sum to ${totalWeight.toFixed(1)}%.`,
      severity: "warning",
    });
  }

  return issues;
};
