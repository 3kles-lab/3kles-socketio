import { GenericJWKSAuth } from "../src/generic/auth/generic-jwks-auth";
import { GenericSocket } from "../src/generic/generic-socket";

export class IonSocket extends GenericSocket {

    public initAuth(): void {
        this.authClient = new IonJWKSAuth({
            jwksUri: process.env.JWKS_URI as string,
            cache: true,
            rateLimit: true,
            jwksRequestsPerMinute: 10
        });
    }
}

class IonJWKSAuth extends GenericJWKSAuth {

    public getUserId(auth: any): string {
        return auth?.Identity2;
    }

}