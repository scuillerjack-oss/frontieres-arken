export function setActiveScreen(document, screen) {
  const welcome = document.querySelector('#welcomeScreen');
  const game = document.querySelector('#gameScreen');
  welcome.hidden = screen !== 'welcome';
  game.hidden = screen !== 'game';
  document.querySelector('#provinceSheet').hidden = true;
  document.querySelector('#moveBanner').hidden = true;
}
