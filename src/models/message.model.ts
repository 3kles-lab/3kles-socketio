export interface IGenericMessage {
    type?: string;
    to?: string;
    room?: string;
    content: any;
}
