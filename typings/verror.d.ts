declare module "verror" {

    class VError {

        message: string;
        name: string;

        constructor (message: string, ...args: any[]);
        constructor (cause: Error, message: string, ...args: any[]);

        cause(): Error;
    }

    export = VError;
}
