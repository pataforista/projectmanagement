/**
 * aiController.js — Proxy for local AI services (Ollama)
 * Used to bypass CORS/Mixed-content restrictions from HTTPS frontends.
 */

export class AIController {
  /**
   * Proxy request to a local/remote Ollama instance.
   * Only reachable if the backend itself can reach the target URL.
   */
  async proxyOllama(c) {
    const body = await c.req.json();
    const targetUrl = c.req.header('x-ollama-url') || 'http://localhost:11434';
    const endpoint = c.req.param('endpoint'); // e.g. 'generate', 'tags', 'chat'

    try {
      const response = await fetch(`${targetUrl}/api/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        return c.json({
          error: 'Ollama Error',
          status: response.status,
          message: response.statusText
        }, response.status);
      }

      // Handle streaming responses (standard for LLMs)
      if (body.stream !== false) {
        const { readable, writable } = new TransformStream();
        response.body.pipeTo(writable);
        return c.newResponse(readable, {
          headers: {
            'Content-Type': 'application/x-ndjson',
            'Transfer-Encoding': 'chunked',
          },
        });
      }

      // Handle buffered responses
      const data = await response.json();
      return c.json(data);

    } catch (err) {
      console.error(`[AIController] Proxy error to ${targetUrl}:`, err);
      return c.json({
        error: 'Proxy Error',
        message: 'Could not reach Ollama instance. If using Cloudflare Worker, ensure target is publicly accessible or use a tunnel.',
        details: err.message
      }, 502);
    }
  }

  /**
   * Generic GET proxy for health checks /api/tags
   */
  async proxyOllamaGet(c) {
    const targetUrl = c.req.header('x-ollama-url') || 'http://localhost:11434';
    const endpoint = c.req.param('endpoint');

    try {
      const response = await fetch(`${targetUrl}/api/${endpoint}`, {
        method: 'GET'
      });

      if (!response.ok) {
        return c.json({ error: 'Ollama Error', status: response.status }, response.status);
      }

      const data = await response.json();
      return c.json(data);
    } catch (err) {
      return c.json({ error: 'Proxy Error', message: err.message }, 502);
    }
  }
}
