import {WEAPONS} from './session.js';
import {publicAsset} from '../publicAsset.js';
import './style.css';

const weaponNotes = {
  sidearm: '初期装備。クレジットを温存できます。',
  smg: '連射が速い近距離向けの武器。',
  rifle: '威力と連射のバランスが取れた武器。',
  marksman: '連射を抑えた遠距離向けの武器。',
};

const digits = value => String(value).padStart(2, '0');
const creditFormat = new Intl.NumberFormat('ja-JP');
const price = value => creditFormat.format(value);

function setText(node, value) {
  const text = String(value);
  if (node.textContent !== text) node.textContent = text;
}

function captureButton(button, callback) {
  let pointerId = null;
  const release = () => {
    if (pointerId === null) return;
    const id = pointerId;
    pointerId = null;
    button.setAttribute('aria-pressed', 'false');
    if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
    callback?.(false);
  };
  button.onpointerdown = event => {
    if (event.button !== 0 || pointerId !== null) return;
    event.preventDefault();
    pointerId = event.pointerId;
    button.setPointerCapture(pointerId);
    button.setAttribute('aria-pressed', 'true');
    callback?.(true);
  };
  const endPointer = event => {
    if (pointerId === event.pointerId) release();
  };
  button.onpointerup = endPointer;
  button.onpointercancel = endPointer;
  button.onlostpointercapture = endPointer;
  return release;
}

export function mountCombatHUD({onBuy, onSell, onStart, onShop, onReload, onAim, onFire, onCrouch, onPreview}) {
  const ui = document.createElement('div');
  ui.className = 'combat-ui';
  ui.hidden = true;
  ui.innerHTML = `
    <div class="combat-hud">
      <div class="combat-round-stack">
        <section class="combat-round" aria-label="射撃訓練の進行状況">
          <div class="combat-round-phase"><small>ラウンド <span data-round>01</span></small><strong data-phase>購入フェーズ</strong></div>
          <strong class="combat-clock" data-clock aria-label="残り時間">—:—</strong>
          <div class="combat-score"><b data-kills>0</b> 撃破</div>
        </section>
        <div class="combat-preview" ${onPreview ? '' : 'hidden'}>
          <button type="button" aria-pressed="false" data-preview><kbd>V</kbd> <span>全身ビュー</span></button>
          <span class="combat-preview-status" role="status" hidden>モデルを読み込み中…</span>
        </div>
      </div>
      <div class="combat-reticle" aria-hidden="true"><i></i><i></i><i></i><i></i><b></b></div>
      <div class="combat-hit" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <section class="combat-loadout" aria-label="武器と弾薬">
        <div class="combat-ammo">
          <div class="combat-equipped"><span data-equipped></span><small data-category></small></div>
          <div class="combat-bullets"><b data-ammo>00</b><span aria-hidden="true">/</span><small data-reserve>000</small></div>
          <div class="combat-ammo-status" data-ammo-status></div>
          <div class="combat-reload-track" aria-hidden="true"><i></i></div>
        </div>
        <div class="combat-loadout-footer">
          <span class="combat-balance"><b data-credits>0</b> CR</span>
          <button class="combat-hud-action" type="button" data-shop aria-controls="combat-shop-panel" aria-expanded="false"><kbd>B</kbd> 武器庫</button>
          <button class="combat-hud-action" type="button" data-deploy><kbd>↵</kbd> 開始</button>
        </div>
      </section>
      <div class="combat-field-hints" aria-label="射撃操作">
        <span><kbd>左クリック</kbd> 射撃</span><span><kbd>右クリック</kbd> 照準</span><span><kbd>R</kbd> 装填</span><span><kbd>Ctrl / C</kbd> しゃがむ</span>
      </div>
      <div class="combat-touch-controls" aria-label="タッチで射撃操作">
        <button type="button" data-touch="reload">装填</button>
        <button type="button" data-touch="crouch" aria-pressed="false">しゃがむ</button>
        <button type="button" data-touch="aim" aria-pressed="false">照準</button>
        <button type="button" data-touch="fire" aria-pressed="false">射撃</button>
      </div>
    </div>
    <div class="combat-shop" hidden>
      <section id="combat-shop-panel" class="combat-shop-panel" role="dialog" aria-modal="true" aria-labelledby="combat-shop-title">
        <header class="combat-shop-header">
          <div><span class="combat-shop-phase">ラウンド <b data-shop-round>01</b> <i>／</i> 購入フェーズ</span><h2 id="combat-shop-title">武器庫</h2></div>
          <div class="combat-shop-balance"><small>所持クレジット</small><span><b data-shop-credits>0</b> CR</span></div>
          <button class="combat-shop-close" type="button" aria-label="武器庫を閉じる">×</button>
        </header>
        <p class="combat-shop-hint">クレジットで武器を選び、訓練に出撃します。</p>
        <div class="combat-shop-grid">
          ${Object.values(WEAPONS).map(weapon => `
            <button type="button" class="combat-weapon" data-weapon="${weapon.id}">
              <span class="combat-weapon-top"><small>${weapon.category}</small><span data-weapon-price></span></span>
              <span class="combat-weapon-heading">
                <strong>${weapon.name}</strong>
                <img src="${publicAsset(`assets/weapons/${weapon.id}.webp`)}" alt="" width="384" height="144" loading="lazy" decoding="async">
              </span>
              <span class="combat-weapon-note">${weaponNotes[weapon.id]}</span>
              <span class="combat-weapon-footer"><span>${weapon.magazine} 発 <i>／</i> ${weapon.automatic ? 'フルオート' : '単発'}</span><span data-weapon-state></span></span>
            </button>
          `).join('')}
        </div>
        <div class="combat-shop-last" data-last-round hidden></div>
        <div class="combat-shop-actions">
          <button class="combat-shop-undo" type="button" data-sell disabled>購入を取り消す</button>
          <button class="combat-shop-start" type="button" data-start>訓練を開始</button>
        </div>
      </section>
    </div>`;
  document.body.append(ui);

  const select = selector => ui.querySelector(selector);
  const hud = select('.combat-hud');
  const shop = select('.combat-shop');
  const panel = select('.combat-shop-panel');
  const close = select('.combat-shop-close');
  const round = select('[data-round]');
  const phase = select('[data-phase]');
  const timer = select('[data-clock]');
  const kills = select('[data-kills]');
  const credits = select('[data-credits]');
  const equipped = select('[data-equipped]');
  const category = select('[data-category]');
  const ammo = select('[data-ammo]');
  const reserve = select('[data-reserve]');
  const ammoStatus = select('[data-ammo-status]');
  const reloadBar = select('.combat-reload-track i');
  const launch = select('[data-deploy]');
  const open = select('[data-shop]');
  const previewButton = select('[data-preview]');
  const previewTitle = previewButton.querySelector('span');
  const previewStatus = select('.combat-preview-status');
  const reticle = select('.combat-reticle');
  const hit = select('.combat-hit');
  const shopRound = select('[data-shop-round]');
  const shopCredits = select('[data-shop-credits]');
  const lastRound = select('[data-last-round]');
  const undo = select('[data-sell]');
  const items = [...shop.querySelectorAll('[data-weapon]')].map(button => ({
    button,
    weapon: WEAPONS[button.dataset.weapon],
    label: button.querySelector('[data-weapon-state]'),
    cost: button.querySelector('[data-weapon-price]'),
  }));
  let hitTimer;
  let lastShopState = '';
  let displayedGap = 4;
  let focusBeforeShop = null;
  const releaseInputs = [
    captureButton(select('[data-touch=fire]'), onFire),
    captureButton(select('[data-touch=aim]'), onAim),
    captureButton(select('[data-touch=crouch]'), onCrouch),
  ];
  const releaseTouch = () => releaseInputs.forEach(release => release());

  close.onclick = open.onclick = () => onShop?.();
  previewButton.onclick = () => onPreview?.();
  select('[data-touch=reload]').onclick = () => onReload?.();
  select('[data-start]').onclick = launch.onclick = () => onStart?.();
  undo.onclick = () => onSell?.();
  shop.onclick = event => { if (event.target === shop) onShop?.(); };
  for (const {button, weapon} of items) {
    button.onclick = () => {
      if (button.getAttribute('aria-disabled') !== 'true') onBuy?.(weapon.id);
    };
  }
  panel.onkeydown = event => {
    if (event.key !== 'Tab') return;
    const tabbable = [...panel.querySelectorAll('button:not(:disabled)')];
    const first = tabbable[0];
    const last = tabbable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  function setShopOpen(value) {
    const visible = value && !ui.hidden;
    if (visible === !shop.hidden) return;
    if (visible) {
      focusBeforeShop = document.activeElement;
      releaseTouch();
    }
    shop.hidden = !visible;
    hud.inert = visible;
    ui.classList.toggle('has-shop', visible);
    open.setAttribute('aria-expanded', String(visible));
    if (visible) close.focus({preventScroll: true});
    else {
      if (focusBeforeShop === open && !open.disabled) open.focus({preventScroll: true});
      else if (panel.contains(document.activeElement)) document.activeElement.blur();
      focusBeforeShop = null;
    }
  }

  function setActive(value) {
    if (!value) {
      setShopOpen(false);
      releaseTouch();
      clearTimeout(hitTimer);
      delete hit.dataset.kind;
    }
    ui.hidden = !value;
    document.body.classList.toggle('combat-active', value);
  }

  function update(state, {aiming = false, crouched = false, spread = null, preview = false, previewLoading = false, previewShowing = preview} = {}) {
    if (!state) return;
    const weapon = WEAPONS[state.weaponId];
    const buying = state.phase === 'buy';
    const remaining = Math.max(0, Math.ceil(state.timeLeft));
    const reloading = state.reloadProgress != null;
    hud.classList.toggle('is-previewing', previewShowing);
    previewButton.setAttribute('aria-pressed', String(preview));
    setText(previewTitle, preview ? '一人称に戻る' : '全身ビュー');
    previewStatus.hidden = !previewLoading;
    timer.classList.toggle('combat-clock-low', !buying && remaining <= 10);
    setText(round, digits(state.round));
    setText(phase, buying ? '購入フェーズ' : '射撃訓練中');
    setText(timer, buying ? '—:—' : `${digits(Math.floor(remaining / 60))}:${digits(remaining % 60)}`);
    setText(kills, state.roundKills);
    setText(credits, price(state.credits));
    setText(equipped, weapon.name);
    setText(category, weapon.category);
    setText(ammo, digits(state.ammo));
    setText(reserve, digits(state.reserve));
    ammo.classList.toggle('combat-ammo-low', state.ammo <= 3);
    const status = reloading ? '装填中' : state.ammo === 0 ? (state.reserve > 0 ? '弾切れ・要装填' : '弾薬なし') : crouched ? 'しゃがみ' : aiming ? '照準中' : '';
    setText(ammoStatus, status);
    const progress = reloading ? state.reloadProgress : 0;
    reloadBar.style.transform = `scaleX(${progress})`;
    const gap = spread == null ? (aiming || crouched ? 3 : 4) : Math.min(28, Math.max(2, Math.round(spread * 370)));
    if (gap !== displayedGap) {
      reticle.style.setProperty('--combat-gap', `${gap}px`);
      displayedGap = gap;
    }
    reticle.classList.toggle('is-aiming', aiming);
    launch.hidden = !buying;
    open.disabled = !buying;

    const shopState = [state.phase, state.round, state.weaponId, state.credits, state.refundableCredits, state.buyStartWeaponId].join('|');
    if (shopState === lastShopState) return;
    lastShopState = shopState;
    setText(shopRound, digits(state.round));
    setText(shopCredits, price(state.credits));
    for (const {button, weapon: option, label, cost} of items) {
      const selected = option.id === state.weaponId;
      const carried = option.id === state.buyStartWeaponId;
      const affordable = carried || option.price <= state.credits + state.refundableCredits;
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-disabled', String(!buying || selected || !affordable));
      setText(cost, carried && option.price > 0 ? '所持済み' : option.price ? `${price(option.price)} CR` : '無料');
      setText(label, selected ? '装備中' : carried ? '持ち替える' : affordable ? '購入する' : 'クレジット不足');
    }
    undo.disabled = !buying || state.weaponId === state.buyStartWeaponId;
    setText(undo, state.refundableCredits ? `取り消す ＋${price(state.refundableCredits)} CR` : '購入を取り消す');
    if (state.lastRound) {
      const result = state.lastRound;
      const accuracy = result.shots ? Math.round(result.hits / result.shots * 100) : 0;
      setText(lastRound, `前ラウンド　${result.kills} 撃破　·　命中率 ${accuracy}%　·　＋${price(result.bonus)} CR`);
    }
    lastRound.hidden = !state.lastRound;
  }

  function flashHit(kind) {
    clearTimeout(hitTimer);
    hit.dataset.kind = kind;
    hitTimer = setTimeout(() => { delete hit.dataset.kind; }, kind === 'kill' ? 240 : 140);
  }

  function dispose() {
    setActive(false);
    ui.remove();
  }

  return {update, setActive, setShopOpen, flashHit, dispose};
}
