import { JwtPayload } from "jsonwebtoken";
import { IGenericAuth } from "./generic-auth.interface";
import * as jwt from 'jsonwebtoken';
import { JwksClient, JwksRateLimitError, Options, SigningKeyNotFoundError } from 'jwks-rsa';
import { v4 as uuidv4 } from 'uuid';

export class GenericJWKSAuth implements IGenericAuth {

    protected client: JwksClient;

    constructor(option: Options) {
        this.initJwksClient(option);
    }

    public async verify(accessToken: string): Promise<string | JwtPayload> {
        try {
            const publicKey = await this.getPublicKey(this.getKid(accessToken));
            return jwt.verify(accessToken, publicKey);
        } catch (e) {
            if (e instanceof SigningKeyNotFoundError) {
                console.error('Error retrieving public key', e);
            } else if (e instanceof JwksRateLimitError) {
                console.error('Jwks limit reached', e);
            }
            else {
                console.error('Error during token validation', e);
            }
            throw e;
        }
    }

    public getUserId(auth: any): string {
        return uuidv4();
    }

    protected initJwksClient(option: Options): void {
        this.client = new JwksClient(option);
    }

    protected async getPublicKey(kid: string): Promise<string> {
        const key = await this.client.getSigningKey(kid);
        return key.getPublicKey();
    }

    protected getKid(accessToken: string): string {
        const decoded = jwt.decode(accessToken, { complete: true, json: true });

        if (!decoded) {
            throw new Error('Jwks kid not found');
        }
        return decoded.header.kid;
    }

}
