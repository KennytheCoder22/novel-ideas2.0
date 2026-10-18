import { portals } from './portals.js';

const gallery = document.getElementById('portals');
for (const portal of portals) {
  const card = document.createElement(portal.href ? 'a' : 'div');
  card.className = 'portal' + (portal.placeholder ? ' portal-placeholder' : ' portal-destination');
  card.dataset.portalId = portal.id;
  if (portal.href) {
    card.href = portal.href;
    card.setAttribute('aria-label', 'Enter ' + portal.title);
  } else {
    card.setAttribute('role', 'img');
    card.setAttribute('aria-label', portal.description + ' — placeholder destination');
    card.dataset.placeholder = 'true';
  }
  const art = document.createElement('span');
  art.className = 'portal-art';
  art.setAttribute('aria-hidden', 'true');
  art.style.backgroundImage = `url("${portal.art.src}")`;
  art.style.backgroundSize = portal.art.size || 'cover';
  art.style.backgroundPosition = portal.art.position || 'center';
  card.append(art);
  if (portal.title) {
    const sign = document.createElement('span');
    sign.className = 'portal-sign';
    sign.textContent = portal.title;
    card.append(sign);
  }
  gallery.append(card);
}
