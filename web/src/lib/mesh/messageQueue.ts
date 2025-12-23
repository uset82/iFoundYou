// Message queue for store-and-forward mesh networking
import type { MeshMessage } from './types';

interface QueuedMessage {
    message: MeshMessage;
    attempts: number;
    lastAttempt: number;
    nextRetry: number;
}

class MessageQueue {
    private queue: Map<string, QueuedMessage> = new Map();
    private readonly MAX_ATTEMPTS = 5;
    private readonly RETRY_DELAY = 30000; // 30 seconds
    private retryTimer: number | null = null;

    public enqueue(message: MeshMessage) {
        const queued: QueuedMessage = {
            message,
            attempts: 0,
            lastAttempt: 0,
            nextRetry: Date.now()
        };

        this.queue.set(message.id, queued);
        this.scheduleRetry();
    }

    public dequeue(messageId: string) {
        this.queue.delete(messageId);
    }

    public getPendingMessages(): MeshMessage[] {
        const now = Date.now();
        const pending: MeshMessage[] = [];

        this.queue.forEach((queued, id) => {
            if (queued.nextRetry <= now && queued.attempts < this.MAX_ATTEMPTS) {
                pending.push(queued.message);

                // Update retry info
                queued.attempts++;
                queued.lastAttempt = now;
                queued.nextRetry = now + this.RETRY_DELAY * Math.pow(2, queued.attempts);
                this.queue.set(id, queued);
            } else if (queued.attempts >= this.MAX_ATTEMPTS) {
                // Remove failed messages
                this.queue.delete(id);
            }
        });

        return pending;
    }

    public clear() {
        this.queue.clear();
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
    }

    public size(): number {
        return this.queue.size;
    }

    private scheduleRetry() {
        if (this.retryTimer) {
            return; // Already scheduled
        }

        this.retryTimer = window.setTimeout(() => {
            this.retryTimer = null;
            const pending = this.getPendingMessages();

            if (pending.length > 0) {
                // Trigger retry event
                window.dispatchEvent(new CustomEvent('mesh:retry', {
                    detail: { messages: pending }
                }));
            }

            // Schedule next retry if queue not empty
            if (this.queue.size > 0) {
                this.scheduleRetry();
            }
        }, this.RETRY_DELAY);
    }
}

export default MessageQueue;
