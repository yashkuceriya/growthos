import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

interface PageTemplate {
  headline?: string
  subheadline?: string
  ctaText?: string
  ctaColor?: string
  bodyText?: string
  imageUrl?: string
}

export default async function PublicLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createServiceClient()

  const { data: page } = await supabase
    .from('landing_pages')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!page) notFound()

  // Increment visits
  await supabase
    .from('landing_pages')
    .update({ visits: (page.visits || 0) + 1 })
    .eq('id', page.id)

  const template = (page.template || {}) as PageTemplate
  const projectId = page.project_id

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', backgroundColor: '#0f172a', color: '#fff', minHeight: '100vh' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          {template.imageUrl && (
            <img src={template.imageUrl} alt="" style={{ maxWidth: '100%', borderRadius: '12px', marginBottom: '32px' }} />
          )}

          <h1 style={{ fontSize: '40px', fontWeight: 800, lineHeight: 1.2, marginBottom: '16px' }}>
            {template.headline || 'Welcome'}
          </h1>

          {template.subheadline && (
            <p style={{ fontSize: '18px', color: '#94a3b8', marginBottom: '32px', lineHeight: 1.6 }}>
              {template.subheadline}
            </p>
          )}

          {template.bodyText && (
            <p style={{ fontSize: '16px', color: '#cbd5e1', marginBottom: '32px', lineHeight: 1.7 }}>
              {template.bodyText}
            </p>
          )}

          {/* Lead capture form */}
          <form
            action={`/api/leads/capture`}
            method="POST"
            style={{ maxWidth: '400px', margin: '0 auto' }}
            onSubmit={undefined}
          >
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="source" value="landing_page" />
            <input type="hidden" name="sourceId" value={page.id} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                name="name"
                type="text"
                placeholder="Your name"
                style={{
                  padding: '12px 16px', borderRadius: '8px', border: '1px solid #334155',
                  backgroundColor: '#1e293b', color: '#fff', fontSize: '16px', outline: 'none',
                }}
              />
              <input
                name="email"
                type="email"
                required
                placeholder="your@email.com"
                style={{
                  padding: '12px 16px', borderRadius: '8px', border: '1px solid #334155',
                  backgroundColor: '#1e293b', color: '#fff', fontSize: '16px', outline: 'none',
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '14px 24px', borderRadius: '8px', border: 'none',
                  backgroundColor: template.ctaColor || '#10b981', color: '#fff',
                  fontSize: '16px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                {template.ctaText || 'Get Started'}
              </button>
            </div>
          </form>

          <p style={{ marginTop: '48px', fontSize: '12px', color: '#475569' }}>
            Powered by GrowthOS
          </p>
        </div>

        {/* Client-side form handler */}
        <script dangerouslySetInnerHTML={{ __html: `
          document.querySelector('form').addEventListener('submit', async function(e) {
            e.preventDefault();
            const fd = new FormData(this);
            const body = Object.fromEntries(fd.entries());
            const btn = this.querySelector('button');
            btn.textContent = 'Submitting...';
            btn.disabled = true;
            try {
              const res = await fetch('/api/leads/capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              });
              if (res.ok) {
                btn.textContent = 'You\\'re in!';
                btn.style.backgroundColor = '#059669';
                this.querySelector('input[name=email]').disabled = true;
                this.querySelector('input[name=name]').disabled = true;
              } else {
                btn.textContent = 'Try again';
                btn.disabled = false;
              }
            } catch {
              btn.textContent = 'Try again';
              btn.disabled = false;
            }
          });
        `}} />
      </body>
    </html>
  )
}
