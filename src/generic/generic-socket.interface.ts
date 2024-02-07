
export interface IGenericSocket {
    start(): Promise<void>;
    getUsers(): Map<string, any>;
    addListener(listener?: { event: string, listener: (...args: any[]) => void }): void;
}
