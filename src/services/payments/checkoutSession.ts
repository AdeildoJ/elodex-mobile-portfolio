export type CheckoutSession = {
  orderId: string;
  checkoutUrl: string;
  title?: string;
  orderPath?: string;
};

let currentCheckoutSession: CheckoutSession | null = null;

export function setCheckoutSession(session: CheckoutSession) {
  currentCheckoutSession = session;
}

export function getCheckoutSession() {
  return currentCheckoutSession;
}

export function clearCheckoutSession() {
  currentCheckoutSession = null;
}
