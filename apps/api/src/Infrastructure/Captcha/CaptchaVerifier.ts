export interface CaptchaVerifier {
    verify(token: string, action: string): Promise<boolean>;
}
