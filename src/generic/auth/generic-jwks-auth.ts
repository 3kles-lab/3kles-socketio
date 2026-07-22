import { IGenericAuth } from './generic-auth.interface';
import { Algorithm, JwtPayload, VerifyOptions, decode, verify } from 'jsonwebtoken';
import { JwksClient, JwksRateLimitError, Options as JwksClientOptions, SigningKeyNotFoundError } from 'jwks-rsa';

export interface GenericJWKSAuthOptions extends JwksClientOptions {
    algorithms?: Algorithm[];
    issuer?: string | string[];
    audience?: string | RegExp | Array<string | RegExp>;
    userIdClaim?: string;
    clockTolerance?: number;
}

export class GenericJWKSAuth implements IGenericAuth {
    protected readonly client!: JwksClient;

    private readonly userIdClaim: string;
    private readonly verifyOptions: VerifyOptions;

    constructor(options: GenericJWKSAuthOptions) {
        const { algorithms = ['RS256'], issuer, audience, userIdClaim = 'sub', clockTolerance = 5, ...jwksOptions } = options;
        this.client = new JwksClient(jwksOptions);
        this.userIdClaim = userIdClaim;
        this.verifyOptions = {
            algorithms,
            issuer,
            audience,
            clockTolerance,
        };
    }

    public async verify(accessToken: string): Promise<string | JwtPayload> {
        try {
            const token = this.removeBearerPrefix(accessToken);
            const publicKey = await this.getPublicKey(this.getKid(token));
            const payload = verify(token, publicKey, this.verifyOptions);

            if (typeof payload === 'string') {
                throw new Error('Unexpected JWT string payload');
            }

            return payload;
        } catch (e) {
            if (e instanceof SigningKeyNotFoundError) {
                console.error('Error retrieving public key', e);
            } else if (e instanceof JwksRateLimitError) {
                console.error('Jwks limit reached', e);
            } else {
                console.error('Error during token validation', e);
            }
            throw e;
        }
    }

    public getUserId(auth: JwtPayload): string {
        const value = auth[this.userIdClaim];

        if (typeof value !== 'string' || !value) {
            throw new Error(`JWT claim "${this.userIdClaim}" is missing or invalid`);
        }

        return value;
    }

    protected async getPublicKey(kid: string): Promise<string> {
        const key = await this.client.getSigningKey(kid);
        return key.getPublicKey();
    }

    protected getKid(accessToken: string): string {
        const decoded = decode(accessToken, { complete: true, json: true });

        if (!decoded || !decoded.header.kid) {
            throw new Error('Jwks kid not found');
        }
        return decoded.header.kid;
    }

    protected removeBearerPrefix(token: string): string {
        return token.startsWith('Bearer ') ? token.substring(7) : token;
    }
}
