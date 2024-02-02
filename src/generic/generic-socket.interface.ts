
export interface IGenericSocket {
    start(): Promise<void>;
    getUsers(): Map<string, any>;
}
