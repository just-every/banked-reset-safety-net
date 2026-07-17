export type TrayClickAction = 'hide' | 'show'

export function getTrayClickAction(isVisible: boolean, isFocused: boolean): TrayClickAction {
  return isVisible && isFocused ? 'hide' : 'show'
}
