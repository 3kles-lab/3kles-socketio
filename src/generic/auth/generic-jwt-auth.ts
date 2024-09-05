import { JwtPayload } from "jsonwebtoken";
import { IGenericAuth } from "./generic-auth.interface";
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

export class GenericJWTAuth implements IGenericAuth {

    constructor(private jwtSecretKey: string) {

    }
    public getUserId(auth: any): string {
        return uuidv4();
    }

    public async verify(accessToken: string): Promise<string | JwtPayload> {
        try {
            return jwt.verify(accessToken, this.jwtSecretKey);
        } catch (e) {
            console.error('Error during token validation', e);
            throw e;
        }

    }

}
