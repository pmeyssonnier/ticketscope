import React from 'react'

// Panneau de réglages (modal) : moteur de lecture, modèle IA, clé API.
export default function Settings({ ai, updateAi, onClose }) {
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
          <option value="claude-haiku-4-5">Haiku 4.5 — rapide / économique (~0,005 €/ticket)</option>
          <option value="claude-sonnet-5">Sonnet 5 — plus précis (~0,02 €/ticket)</option>
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
          🔑 Votre clé reste <b>sur cet appareil</b> (stockage local du navigateur), jamais
          transmise ailleurs qu'à l'API Anthropic. Créez-en une sur{' '}
          <b>console.anthropic.com</b>.
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
