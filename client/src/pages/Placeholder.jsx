export default function Placeholder({ name }) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            gap: '1rem',
            textAlign: 'center',
            padding: '2rem',
        }}>
            <span style={{ fontSize: '3rem' }}>🚧</span>
            <h2 style={{
                fontFamily: 'var(--font-heading)',
                color: 'var(--primary-dark)',
                fontSize: '1.5rem',
            }}>
                {name}
            </h2>
            <p style={{
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.9rem',
            }}>
                This screen is being migrated to React.
            </p>
        </div>
    );
}
