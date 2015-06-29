/// <reference path="../typings/node.d.ts" />
/// <reference path="./types.d.ts" />

import util = require("util");


export function emitFiles(outDir: string, types: Type[]): EmitResults {

    var currentFile: string;

    var result: EmitResults = {
        errors: []
    }

    types.forEach(type => {

        if(type.kind != TypeKind.InterfaceType && type.kind != TypeKind.EnumType) {
            addError("Top-level type must be an Interface or Enum.");
            return;
        }

        if(!type.name) {
            addError("Type missing name.");
            return;
        }


    });

    function addError(message: string, ...args: any[]) {

        var msg = util.format.apply(this, arguments);
        if(currentFile) {
            msg = currentFile + ": " + msg;
        }
        result.errors.push(msg);
    }

    function emitType(type: Type): void {
        switch(type.kind) {

            case TypeKind.TypeReference:
                break;
            case TypeKind.ObjectType:
                break;
            case TypeKind.InterfaceType:
                break;
            case TypeKind.EnumType:
                break;
            case TypeKind.ArrayType:
                break;
        }
    }

    return result;
}

