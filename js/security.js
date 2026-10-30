/**
 * span-plan / js/security.js
 * Zero-Knowledge / Anonymous Security Architecture
 * - Web Crypto SHA-256 with custom salt
 * - 4-digit PIN lock screen with auto-advance and session unlock
 * - Emergency Recovery Key (REC-XXXX-XXXX-XXXX)
 * - Multi-device QR Code pairing & direct link generator
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SpanSecurity = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const PIN_SALT = '_salt_span_secure';

  // 1. Web Crypto SHA-256 (browser + node isomorphic)
  async function sha256(str) {
    if (!str) return '';
    try {
      const buf = new TextEncoder().encode(str + PIN_SALT);
      const subtle = (typeof crypto !== 'undefined' && crypto.subtle) 
        ? crypto.subtle 
        : (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle);
      if (!subtle) {
        throw new Error('Web Crypto API (subtle) not available');
      }
      const hashBuf = await subtle.digest('SHA-256', buf);
      const hashArr = Array.from(new Uint8Array(hashBuf));
      return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.error('SHA-256 hashing error:', e);
      return '';
    }
  }

  // 2. Anonymous Account ID Management (Zero-Knowledge)
  function getOrCreateAccountId() {
    if (typeof window === 'undefined') return 'span_test_account';
    
    // 1. Détection via paramètre URL ?sync=
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const syncParam = urlParams.get('sync');
      if (syncParam && syncParam.trim()) {
        const cleanSync = syncParam.trim();
        localStorage.removeItem('span_user_logged_out');
        localStorage.setItem('span_account_id', cleanSync);
        localStorage.setItem('span_sync_user', cleanSync);
        localStorage.setItem('span_sync_key_manually_set', 'true');
        return cleanSync;
      }
    } catch (e) {}

    // Si l'utilisateur s'est explicitement déconnecté, ne jamais fabriquer d'ID fantôme !
    if (localStorage.getItem('span_user_logged_out') === 'true') {
      return '';
    }

    // 2. Détection via localStorage (supporte span_account_id et span_sync_user)
    let id = localStorage.getItem('span_account_id') || localStorage.getItem('span_sync_user');
    const isLocalhost = Boolean(
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '0.0.0.0'
    );
    const manuallySet = localStorage.getItem('span_sync_key_manually_set') === 'true';

    if (!id || (isLocalhost && !manuallySet)) {
      const part = Math.random().toString(36).substring(2, 8);
      const time = Date.now().toString(36);
      id = isLocalhost ? 'span_local_user' : `span_${part}_${time}`;
      localStorage.setItem('span_account_id', id);
      localStorage.setItem('span_sync_user', id);
    } else {
      // Synchronisation bidirectionnelle des deux clés de stockage
      localStorage.setItem('span_account_id', id);
      localStorage.setItem('span_sync_user', id);
    }
    return id;
  }

  // 3. Clé de Secours d'Urgence (REC-XXXX-XXXX-XXXX)
  function generateRecoveryKey() {
    const part = () => Math.random().toString(36).substring(2, 6).toUpperCase();
    return `REC-${part()}-${part()}-${part()}`;
  }

  function getOrCreateRecoveryKey() {
    if (typeof localStorage === 'undefined') return 'REC-DEMO-TEST-KEY1';
    let key = localStorage.getItem('span_recovery_key');
    if (!key || !key.startsWith('REC-')) {
      key = generateRecoveryKey();
      localStorage.setItem('span_recovery_key', key);
    }
    return key;
  }

  // 4. Statut de verrouillage
  function isAppLocked() {
    if (typeof localStorage === 'undefined' || typeof sessionStorage === 'undefined') return false;
    const pinHash = localStorage.getItem('span_pin_hash');
    const isUnlocked = sessionStorage.getItem('span_session_unlocked') === 'true';
    return Boolean(pinHash && !isUnlocked);
  }

  // 5. Gestion de l'Auto-Advance pour les champs PIN 4 chiffres
  function setupPinAutoAdvance(inputIds, onSubmit) {
    if (typeof document === 'undefined') return;

    inputIds.forEach((id, idx) => {
      const el = document.getElementById(id);
      if (!el) return;

      // Gestion du coller (paste complet des 4 chiffres)
      el.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text').trim();
        const digits = text.replace(/\D/g, '').slice(0, inputIds.length);
        if (digits.length > 0) {
          digits.split('').forEach((d, i) => {
            const targetEl = document.getElementById(inputIds[i]);
            if (targetEl) targetEl.value = d;
          });
          const lastIdx = Math.min(digits.length - 1, inputIds.length - 1);
          const nextEl = document.getElementById(inputIds[lastIdx]);
          if (nextEl) nextEl.focus();
          if (digits.length === inputIds.length && typeof onSubmit === 'function') {
            onSubmit();
          }
        }
      });

      // Saisie d'un chiffre
      el.addEventListener('input', () => {
        el.value = el.value.replace(/\D/g, '').slice(0, 1);
        if (el.value && idx < inputIds.length - 1) {
          const next = document.getElementById(inputIds[idx + 1]);
          if (next) next.focus();
        }
        // Déclenchement automatique au 4ème chiffre saisi
        const allFilled = inputIds.every(inputId => {
          const inp = document.getElementById(inputId);
          return inp && inp.value.length === 1;
        });
        if (allFilled && typeof onSubmit === 'function') {
          onSubmit();
        }
      });

      // Retour arrière (Backspace)
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !el.value && idx > 0) {
          const prev = document.getElementById(inputIds[idx - 1]);
          if (prev) {
            prev.focus();
            prev.value = '';
          }
        } else if (e.key === 'Enter' && typeof onSubmit === 'function') {
          onSubmit();
        }
      });
    });
  }

  // 6. Écran de Verrouillage (PIN Lock Screen)
  function showLockScreen() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('spanLockModal');
    if (!modal) return;
    modal.style.display = 'flex';

    const err = document.getElementById('unlockError');
    if (err) err.style.display = 'none';

    ['unlockPin1', 'unlockPin2', 'unlockPin3', 'unlockPin4'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    setTimeout(() => {
      const first = document.getElementById('unlockPin1');
      if (first) first.focus();
    }, 100);
  }

  function hideLockScreen() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('spanLockModal');
    if (modal) modal.style.display = 'none';
  }

  async function checkUnlockPin() {
    if (typeof document === 'undefined') return;
    const ids = ['unlockPin1', 'unlockPin2', 'unlockPin3', 'unlockPin4'];
    const pin = ids.map(id => {
      const el = document.getElementById(id);
      return el ? el.value : '';
    }).join('');

    if (pin.length !== 4) return;

    const enteredHash = await sha256(pin);
    const storedHash = localStorage.getItem('span_pin_hash');

    if (enteredHash === storedHash) {
      sessionStorage.setItem('span_session_unlocked', 'true');
      hideLockScreen();
      if (typeof window.showToast === 'function') {
        window.showToast("Application déverrouillée", 'success');
      }
    } else {
      const err = document.getElementById('unlockError');
      if (err) err.style.display = 'block';

      const group = document.querySelector('#spanLockModal .pin-input-group');
      if (group) {
        group.classList.remove('shake-pin');
        void group.offsetWidth;
        group.classList.add('shake-pin');
      }

      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const first = document.getElementById('unlockPin1');
      if (first) first.focus();
    }
  }

  async function unlockWithRecoveryKey() {
    const key = prompt("Entrez votre clé de secours d'urgence (ex: REC-XXXX-XXXX-XXXX) :");
    if (!key) return;

    const cleanKey = key.trim().toUpperCase();
    const currentKey = getOrCreateRecoveryKey().toUpperCase();
    const remoteHash = (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem('span_remote_recovery_hash') : null;
    const enteredHash = await sha256(cleanKey);

    if (cleanKey === currentKey || (remoteHash && enteredHash === remoteHash)) {
      alert("Clé de secours validée ! Le code PIN a été réinitialisé.");
      localStorage.removeItem('span_pin_hash');
      sessionStorage.setItem('span_session_unlocked', 'true');
      hideLockScreen();
      if (typeof window.syncPlanToCloud === 'function') {
        window.syncPlanToCloud();
      }
      updateSecurityUI();
    } else {
      alert("Clé de secours incorrecte. Veuillez vérifier et réessayer.");
    }
  }

  // 7. Interface Utilisateur de Sécurité (Settings Modal)
  let isRecoveryRevealed = false;

  function updateSecurityUI() {
    if (typeof document === 'undefined') return;

    const accountId = getOrCreateAccountId();
    const isConnected = !!accountId;
    const pinHash = localStorage.getItem('span_pin_hash');
    const recoveryKey = getOrCreateRecoveryKey();

    // Identifiant de compte
    const accEl = document.getElementById('displayAccountId');
    if (accEl) accEl.textContent = isConnected ? accountId : 'Non connecté';

    const syncKeyEl = document.getElementById('displaySyncKey');
    if (syncKeyEl) syncKeyEl.textContent = isConnected ? accountId : 'Déconnecté (aucun compte lié)';

    const connectedView = document.getElementById('syncConnectedView');
    const disconnectedView = document.getElementById('syncDisconnectedView');
    const btnLogout = document.getElementById('btnLogoutSync');
    const btnCopy = document.getElementById('btnCopySyncKey');

    if (connectedView) connectedView.style.display = isConnected ? 'block' : 'none';
    if (disconnectedView) disconnectedView.style.display = isConnected ? 'none' : 'block';
    if (btnLogout) btnLogout.style.display = isConnected ? 'inline-flex' : 'none';
    if (btnCopy) btnCopy.style.display = isConnected ? 'inline-flex' : 'none';

    // Statut PIN
    const badge = document.getElementById('pinStatusBadge');
    const desc = document.getElementById('pinStatusDesc');
    const removeBtn = document.getElementById('btnRemovePin');
    if (badge) {
      if (pinHash) {
        badge.textContent = "🔒 Actif (4 chiffres)";
        badge.className = "security-badge active";
        if (desc) desc.textContent = "Votre planning est verrouillé par votre code PIN à 4 chiffres.";
        if (removeBtn) removeBtn.style.display = 'inline-flex';
      } else {
        badge.textContent = "🔓 Désactivé";
        badge.className = "security-badge inactive";
        if (desc) desc.textContent = "Aucun code PIN configuré. Accès ouvert sur cet appareil.";
        if (removeBtn) removeBtn.style.display = 'none';
      }
    }

    // Clé de secours
    const recEl = document.getElementById('displayRecoveryKey');
    const revealBtn = document.getElementById('revealRecoveryBtn');
    if (recEl) {
      recEl.textContent = isRecoveryRevealed ? recoveryKey : '••••-••••-••••-••••';
    }
    if (revealBtn) {
      revealBtn.textContent = isRecoveryRevealed ? 'Masquer' : 'Afficher';
    }

    // QR Code de jumelage
    const qrImg = document.getElementById('spanSyncQrCode');
    if (qrImg && isConnected) {
      const pairUrl = `${window.location.origin}${window.location.pathname}?sync=${encodeURIComponent(accountId)}`;
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(pairUrl)}`;
    }
  }

  function toggleRevealRecovery() {
    isRecoveryRevealed = !isRecoveryRevealed;
    updateSecurityUI();
  }

  function copyRecoveryKey() {
    const key = getOrCreateRecoveryKey();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(key).then(() => {
        if (typeof window.showToast === 'function') window.showToast("Clé de secours copiée !", 'success');
        else alert("Clé de secours copiée ! Conservez-la précieusement.");
      }).catch(() => {
        alert("Clé de secours : " + key);
      });
    } else {
      alert("Clé de secours : " + key);
    }
  }

  function copyDirectPairLink() {
    const accountId = getOrCreateAccountId();
    if (!accountId) {
      if (typeof window.showToast === 'function') window.showToast("Vous devez être connecté à un compte pour le jumeler.", 'warning');
      else alert("Connectez-vous à un compte pour obtenir le lien de jumelage.");
      return;
    }
    const pairUrl = `${window.location.origin}${window.location.pathname}?sync=${encodeURIComponent(accountId)}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(pairUrl).then(() => {
        if (typeof window.showToast === 'function') window.showToast("Lien direct de jumelage copié !", 'success');
        else alert("Lien direct copié ! Ouvrez-le sur votre iPhone.");
      }).catch(() => {
        alert("Lien : " + pairUrl);
      });
    } else {
      alert("Lien : " + pairUrl);
    }
  }

  async function saveNewPin() {
    const ids = ['newPin1', 'newPin2', 'newPin3', 'newPin4'];
    const pin = ids.map(id => {
      const el = document.getElementById(id);
      return el ? el.value : '';
    }).join('');

    if (pin.length !== 4) {
      alert("Veuillez saisir un code PIN complet à 4 chiffres.");
      return;
    }

    const hash = await sha256(pin);
    localStorage.setItem('span_pin_hash', hash);
    sessionStorage.setItem('span_session_unlocked', 'true');

    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    if (typeof window.showToast === 'function') {
      window.showToast("Code PIN activé ! Planning protégé 🔒", 'success');
    } else {
      alert("Code PIN activé avec succès !");
    }

    updateSecurityUI();
    if (typeof window.syncPlanToCloud === 'function') {
      window.syncPlanToCloud();
    }
  }

  function removePin() {
    if (!confirm("Voulez-vous vraiment désactiver la protection par code PIN ?")) return;
    localStorage.removeItem('span_pin_hash');
    if (typeof window.showToast === 'function') {
      window.showToast("Code PIN désactivé.", 'info');
    } else {
      alert("Code PIN désactivé.");
    }
    updateSecurityUI();
    if (typeof window.syncPlanToCloud === 'function') {
      window.syncPlanToCloud();
    }
  }

  // 8. Initialisation au chargement de la page
  if (typeof window !== 'undefined') {
    // Expose helpers globally
    window.sha256 = sha256;
    window.saveNewPin = saveNewPin;
    window.removePin = removePin;
    window.toggleRevealRecovery = toggleRevealRecovery;
    window.copyRecoveryKey = copyRecoveryKey;
    window.copyDirectPairLink = copyDirectPairLink;
    window.unlockWithRecoveryKey = unlockWithRecoveryKey;
    window.checkUnlockPin = checkUnlockPin;

    window.addEventListener('DOMContentLoaded', () => {
      // Configuration de l'auto-advance pour le déverrouillage et la création
      setupPinAutoAdvance(['unlockPin1', 'unlockPin2', 'unlockPin3', 'unlockPin4'], checkUnlockPin);
      setupPinAutoAdvance(['newPin1', 'newPin2', 'newPin3', 'newPin4'], null);

      // Vérification immédiate du verrouillage au chargement
      if (isAppLocked()) {
        showLockScreen();
      }

      // Nettoyer l'URL du paramètre ?sync= après l'avoir enregistré
      try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('sync')) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (e) {}

      updateSecurityUI();
    });
  }

  return {
    sha256,
    getOrCreateAccountId,
    generateRecoveryKey,
    getOrCreateRecoveryKey,
    isAppLocked,
    setupPinAutoAdvance,
    showLockScreen,
    hideLockScreen,
    checkUnlockPin,
    unlockWithRecoveryKey,
    updateSecurityUI,
    toggleRevealRecovery,
    copyRecoveryKey,
    copyDirectPairLink,
    saveNewPin,
    removePin
  };
});
