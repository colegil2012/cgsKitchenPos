/**
 * TS mirror of the cgsKitchen backend contract.
 *
 *  - MenuItemView / OptionGroupView / OptionChoiceView  <- GET /api/menu/menu
 *  - PosLineItem / PosOrderRequest                      -> POST /api/pos/orders
 *  - OrderView                                          <- order endpoints
 *  - UpdateStatusRequest                                -> POST /api/orders/{id}/status
 *
 * Keep in sync with the Java records/classes.
 */

export type SelectionType = 'SINGLE' | 'MULTI';

export interface OptionChoiceView {
  id: string;
  label: string;
  priceDeltaCents: number;
  available: boolean;
  unavailableReason: string | null;
  defaultChoice: boolean;
}

export interface OptionGroupView {
  id: string;
  label: string;
  selectionType: SelectionType;
  required: boolean;
  available: boolean;
  unavailableReason: string | null;
  maxSelections: number; // 0 = no cap (MULTI only)
  choices: OptionChoiceView[];
}

export interface MenuItemView {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  priceDisplay: string | null;
  categoryId: string;
  categoryName: string;
  badgeId: string | null;
  badgeLabel: string | null;
  badgeColor: string | null;
  available: boolean;
  sortOrder: number;
  optionGroups: OptionGroupView[];
}

export interface PosLineItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  modifiers?: string[]; // flattened "Group: Choice" labels, sent to the server
  notes?: string | null; // free-text special instructions for this line
}

export interface PosOrderRequest {
  items: PosLineItem[];
  /** The event this order belongs to. Captured at ring-up; stamped by
   *  the server onto the Order. Required server-side (no orphaned orders). */
  eventId: string | null;
  /** Optional customer attachment (from email lookup). Null = walk-in. */
  userId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
}

export interface OrderView {
  id: string;
  status: string;
  fulfillment: string;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    menuItemId: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
    modifiers?: string[];
    notes?: string | null;
  }>;
}

export interface UpdateStatusRequest {
  status: string;
  actor?: string | null;
  note?: string | null;
}