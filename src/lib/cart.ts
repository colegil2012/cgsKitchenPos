import type {MenuItemView, PosLineItem} from '../types/menu';

/**
 * A configured cart line: a menu item plus resolved option selections.
 * `selections` maps optionGroupId -> chosen choiceIds (array even for
 * SINGLE, to keep one shape).
 */
export interface CartLine {
  lineId: string;
  item: MenuItemView;
  selections: Record<string, string[]>;
  quantity: number;
}

export const TAX_RATE = 0.07; // matches PosApiController.createPosOrder

export function upchargeCents(line: CartLine): number {
  let sum = 0;
  for (const group of line.item.optionGroups) {
    for (const choiceId of line.selections[group.id] ?? []) {
      const choice = group.choices.find(c => c.id === choiceId);
      if (choice) sum += choice.priceDeltaCents;
    }
  }
  return sum;
}

export function unitPriceCents(line: CartLine): number {
  return line.item.priceCents + upchargeCents(line);
}

export function lineTotalCents(line: CartLine): number {
  return unitPriceCents(line) * line.quantity;
}

/** "(Cheddar, +Mint sauce)" — MULTI choices prefixed with +. */
export function selectionSummary(line: CartLine): string {
  const parts: string[] = [];
  for (const group of line.item.optionGroups) {
    for (const choiceId of line.selections[group.id] ?? []) {
      const choice = group.choices.find(c => c.id === choiceId);
      if (!choice) continue;
      parts.push(group.selectionType === 'MULTI' ? `+${choice.label}` : choice.label);
    }
  }
  return parts.length ? ` (${parts.join(', ')})` : '';
}

/**
 * THE FLATTENING — collapse a configured line into the flat PosLineItem
 * the order API accepts: option deltas folded into unitPriceCents, choice
 * labels appended to name. Single change point if PosLineItem ever grows
 * a structured options field server-side.
 */
export function toPosLineItem(line: CartLine): PosLineItem {
  return {
    menuItemId: line.item.id,
    name: `${line.item.name}${selectionSummary(line)}`,
    quantity: line.quantity,
    unitPriceCents: unitPriceCents(line),
  };
}

/** Initial selections from the view's defaults (mirrors server resolution). */
export function defaultSelections(item: MenuItemView): Record<string, string[]> {
  const sel: Record<string, string[]> = {};
  for (const group of item.optionGroups) {
    sel[group.id] = group.choices
      .filter(c => c.available && c.defaultChoice)
      .map(c => c.id);
    if (group.selectionType === 'SINGLE' && sel[group.id].length === 0) {
      const first = group.choices.find(c => c.available);
      if (first) sel[group.id] = [first.id];
    }
  }
  return sel;
}

/** First violated group rule, or null. Mirrors MenuService.resolveSelections. */
export function validateSelections(
  item: MenuItemView,
  selections: Record<string, string[]>,
): string | null {
  for (const group of item.optionGroups) {
    const picks = selections[group.id] ?? [];
    if (group.selectionType === 'SINGLE') {
      if (picks.length > 1) return `${group.label} accepts only one choice.`;
      if (picks.length === 0 && group.required) {
        const anyAvail = group.choices.some(c => c.available);
        return anyAvail
          ? `Please choose a ${group.label}.`
          : `${group.label} is currently unavailable.`;
      }
    } else if (group.maxSelections > 0 && picks.length > group.maxSelections) {
      return `Pick at most ${group.maxSelections} for ${group.label}.`;
    }
  }
  return null;
}

let _seq = 0;
export function newLineId(): string {
  _seq += 1;
  return `line_${Date.now()}_${_seq}`;
}
