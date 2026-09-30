import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

interface SSEClient {
  id: string;
  res: Response;
}

/**
 * Server-Sent Events Manager
 * Handles multiple SSE connections grouped by channel
 */
export class SSEManager {
  private clients: Map<string, SSEClient[]> = new Map();

  /**
   * Register a new SSE client
   */
  addClient(channel: string, res: Response): string {
    const clientId = uuidv4();
    const client: SSEClient = { id: clientId, res };

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering

    // Initialize channel if needed
    if (!this.clients.has(channel)) {
      this.clients.set(channel, []);
    }

    // Add client to channel
    this.clients.get(channel)!.push(client);

    // Handle client disconnect
    res.on('close', () => {
      this.removeClient(channel, clientId);
    });

    res.on('error', (error) => {
      console.error(`SSE client error on channel ${channel}:`, error.message);
      this.removeClient(channel, clientId);
    });

    // Send initial connection message
    this.sendToClient(res, 'connected', { channel, clientId });

    return clientId;
  }

  /**
   * Send message to all clients on a channel
   */
  sendToChannel(channel: string, event: string, data: any): void {
    const clients = this.clients.get(channel) || [];
    const message = this.formatSSEMessage(event, data);

    clients.forEach((client) => {
      try {
        if (!client.res.headersSent) {
          client.res.write(message);
        }
      } catch (error) {
        console.error(`Error sending SSE message to client:`, error);
        this.removeClient(channel, client.id);
      }
    });
  }

  /**
   * Send message to a specific client
   */
  sendToClient(res: Response, event: string, data: any): void {
    try {
      const message = this.formatSSEMessage(event, data);
      res.write(message);
    } catch (error) {
      console.error('Error sending SSE message to client:', error);
    }
  }

  /**
   * Broadcast to all clients (all channels)
   */
  broadcastToAll(event: string, data: any): void {
    this.clients.forEach((clients) => {
      const message = this.formatSSEMessage(event, data);
      clients.forEach((client) => {
        try {
          client.res.write(message);
        } catch (error) {
          console.error('Error broadcasting to client:', error);
        }
      });
    });
  }

  /**
   * Remove a client from a channel
   */
  private removeClient(channel: string, clientId: string): void {
    const clients = this.clients.get(channel);
    if (clients) {
      const index = clients.findIndex((c) => c.id === clientId);
      if (index >= 0) {
        clients.splice(index, 1);
        console.log(`SSE client disconnected from ${channel}. Remaining: ${clients.length}`);
      }
    }
  }

  /**
   * Get client count for a channel
   */
  getClientCount(channel: string): number {
    return (this.clients.get(channel) || []).length;
  }

  /**
   * Get total client count
   */
  getTotalClientCount(): number {
    let total = 0;
    this.clients.forEach((clients) => {
      total += clients.length;
    });
    return total;
  }

  /**
   * Format data as SSE message
   */
  private formatSSEMessage(event: string, data: any): string {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    return `event: ${event}\ndata: ${dataStr}\n\n`;
  }

  /**
   * Close all connections
   */
  closeAll(): void {
    this.clients.forEach((clients) => {
      clients.forEach((client) => {
        try {
          client.res.end();
        } catch (error) {
          console.error('Error closing SSE connection:', error);
        }
      });
    });
    this.clients.clear();
  }
}

// Singleton instance
export const sseManager = new SSEManager();
