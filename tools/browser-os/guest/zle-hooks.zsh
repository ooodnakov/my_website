_browser_os_emit_state() {
  print -r -- "state:$1" >> /run/browser-os/shell-out 2>/dev/null
}

_browser_os_line_init() {
  _browser_os_emit_state unknown
}

_browser_os_line_finish() {
  _browser_os_emit_state busy
}

_browser_os_pre_redraw() {
  local state=unknown
  if [[ -z "$BUFFER" ]] && (( PENDING == 0 && KEYS_QUEUED_COUNT == 0 )); then
    state=cleanPrompt
  elif [[ -n "$BUFFER" ]]; then
    state=editing
  fi
  _browser_os_emit_state "$state"
}

preexec() {
  _browser_os_emit_state busy
}

precmd() {
  _browser_os_emit_state unknown
}

zle -N zle-line-init _browser_os_line_init
zle -N zle-line-finish _browser_os_line_finish
zle -N zle-line-pre-redraw _browser_os_pre_redraw
