import * as jwt from 'jsonwebtoken';

export interface IGenericAuth {
    verify(accessToken: string): Promise<string | jwt.JwtPayload>;
    getUserId(auth: any): string;
}
