import React from 'react'

// Panneau de réglages (modal) : moteur de lecture, modèle IA, clé API.
export default function Settings({ ai, updateAi, keyKind, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Réglages</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        <label className="field">Moteur de lecture par défaut</label>
        <div className="engine-switch" style={{ marginBottom: 14 }}>
          <button
            type="button"
            className={`eng ${ai.engine !== 'claude' ? 'active' : ''}`}
            onClick={() => updateAi({ engine: 'local' })}
          >
            ⚡ OCR local <span className="muted">· hors-ligne</span>
          </button>
          <button
            type="button"
            className={`eng ${ai.engine === 'claude' ? 'active' : ''}`}
            onClick={() => updateAi({ engine: 'claude' })}
          >
            ✨ IA Claude <span className="muted">· précis</span>
          </button>
        </div>

        <label className="field">Modèle IA (mode ✨ Claude)</label>
        <select value={ai.model} onChange={(e) => updateAi({ model: e.target.value })}>
          <option value="claude-haiku-4-5">Haiku 4.5 — rapide / économique (recommandé)</option>
          <option value="claude-haiku-5-5">Haiku 5.5 — plus récent, moins cher (à tester)</option>
          <option value="claude-sonnet-5">Sonnet 5 — plus précis</option>
          <option value="claude-sonnet-5-5">Sonnet 5.5 — plus précis (à tester)</option>
        </select>

        <label className="field" style={{ marginTop: 12 }}>
          Clé API Anthropic
        </label>
        <input
          type="password"
          value={ai.apiKey}
          onChange={(e) => updateAi({ apiKey: e.target.value })}
          placeholder="sk-ant-…"
          autoComplete="off"
        />
        <p className="inline-note">
          🔑 Votre clé reste <b>sur cet appareil</b>, jamais transmise ailleurs qu'à l'API
          Anthropic. Créez-en une sur <b>console.anthropic.com</b> (avec une limite de dépense).
        </p>
        <p className="inline-note">
          {keyKind === 'encrypted' && '🔒 Clé chiffrée sur cet appareil (clé non exportable du navigateur).'}
          {keyKind === 'memory' &&
            '⚠️ La clé n’a pas pu être conservée (chiffrement indisponible ou stockage plein) : elle reste en mémoire jusqu’à la fermeture de l’application et devra être ressaisie.'}
          {keyKind === 'legacy' &&
            '⚠️ Ce navigateur ne permet pas le chiffrement : la clé reste dans l’ancien emplacement, en clair.'}
        </p>
        <p className="inline-note">
          ⚠️ En mode <b>✨ IA</b>, l'image du ticket est <b>envoyée à l'API Anthropic</b> (elle
          quitte l'appareil). Le mode <b>⚡ OCR local</b> reste 100 % hors-ligne.
        </p>

        <div className="btn-row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
