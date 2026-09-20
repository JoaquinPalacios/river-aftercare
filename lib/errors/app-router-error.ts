export type AppRouterErrorProps = {
  error: unknown;
  retry?: () => void;
  reset?: () => void;
};

export function errorRecoveryAction(
  props: Pick<AppRouterErrorProps, "retry" | "reset">
): (() => void) | null {
  return props.retry ?? props.reset ?? null;
}
