// after a failed submit, take keyboard / screen reader users straight to the first problem.
// deferred, because the form is usually still disabled (submitting) when the error comes in
export const focusFirstError = (errors) => {
  const first = Object.keys(errors).find((key) => errors[key])
  if (first) setTimeout(() => document.getElementById(first)?.focus(), 0)
}
