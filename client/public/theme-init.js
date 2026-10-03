// runs before the app renders so a saved theme doesn't flash the other one first
try {
  var theme = localStorage.getItem('theme')
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
} catch (e) {
  // storage blocked, the system theme is used
}
