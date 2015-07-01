/// <reference path="../../typings/node.d.ts" />
/// <reference path="./../types.d.ts" />

import util = require("util");
import path = require("path");

import Writer = require("../writer");

function emitFiles(outDir: string, types: Type[]): EmitResults {

    var currentFile: string;

    var result: EmitResults = {
        errors: []
    }

    var writer = new Writer(path.join(outDir, "fhir.d.ts"));

    // Write the header
    writer.write("// Type definitions for FHIR DSTU2 v0.5.0");
    writer.writeLine();
    writer.write("// Project: http://www.hl7.org/fhir/2015May/index.html");
    writer.writeLine();
    writer.write("// Definitions by: Artifact Health <www.artifacthealth.com>");
    writer.writeLine();
    writer.write("// Definitions: https://github.com/borisyankov/DefinitelyTyped");
    writer.writeLine();
    writer.writeLine();
    writer.write("declare module fhir {");
    writer.writeLine();
    writer.increaseIndent();


    types.forEach(type => {

        if(!(type.kind & TypeKind.RootTypes)) {
            addError("Expected root type instead of '%d'.", type.kind);
            return;
        }

        if(!type.name) {
            addError("Type missing name.");
            return;
        }

        emitType(type);
    });

    writer.decreaseIndent();
    writer.write("}");
    writer.writeLine();

    writer.close();
    return result;


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
                emitTypeReference(<TypeReference>type);
                break;
            case TypeKind.ObjectType:
                emitObjectType(<ObjectType>type);
                break;
            case TypeKind.InterfaceType:
                emitInterfaceType(<InterfaceType>type);
                break;
            case TypeKind.EnumType:
                // Do nothing
                break;
            case TypeKind.ArrayType:
                emitArrayType(<ArrayType>type);
                break;
            case TypeKind.UnionType:
                emitUnionType(<UnionType>type);
                break;
            case TypeKind.Primitive:
                emitPrimitivetype(<PrimitiveType>type);
                break;
            default:
                addError("Cannot emit unknown type %d", type.kind);
        }
    }

    function emitPrimitivetype(primitiveType: PrimitiveType): void {

        // ignore built-in types
        if(primitiveType.name == "string" || primitiveType.name == "boolean") return;

        emitComment(primitiveType.description);

        writer.write("type ");
        writer.write(primitiveType.name);
        writer.write(" = ");
        writer.write(primitiveType.intrinsicType);
        writer.write(";");
        writer.writeLine();
    }

    function emitInterfaceType(interfaceType: InterfaceType): void {

        emitComment(interfaceType.description);

        writer.write("interface ");
        writer.write(interfaceType.name);
        writer.write(" ");

        if(interfaceType.baseType) {
            writer.write("extends ");
            writer.write(interfaceType.baseType);
            writer.write(" ");
        }

        writer.write("{");
        writer.writeLine();
        writer.writeLine();
        writer.increaseIndent();

        emitProperties(interfaceType);

        writer.decreaseIndent();
        writer.write("}");
        writer.writeLine();
    }

    function emitComment(text: string): void {

        if(!text) return;

        var lines = text.split("\n");

        writer.write("/**");
        writer.writeLine();

        lines.forEach(line => {
            writer.write(" * " + line);
            writer.writeLine();
        });

        writer.write(" */");
        writer.writeLine();
    }

    function emitProperties(objectType: ObjectType): void {

        objectType.properties.forEach(x => emitProperty(x));
    }

    function emitProperty(property: Property): void {

        emitComment(property.description);

        writer.write(property.name);

        if(property.optional) {
            writer.write("?");
        }
        writer.write(": ");

        emitType(property.type);

        if(property.type.kind != TypeKind.ObjectType) {
            writer.write(";");
        }

        writer.writeLine();
        writer.writeLine();
    }

    function emitObjectType(objectType: ObjectType): void {

        writer.write("{");
        writer.writeLine();
        writer.increaseIndent();
        emitProperties(objectType);
        writer.decreaseIndent();
        writer.write("}");
    }

    function emitTypeReference(typeReference: TypeReference): void {

        // Do not emit binding information
        writer.write(typeReference.name);
    }

    function emitEnumType(enumType: EnumType): void {

        emitComment(enumType.description);

        writer.write("enum ");
        writer.write(enumType.name);
        writer.write(" {");
        writer.writeLine();
        writer.writeLine();
        writer.increaseIndent();

        for(var i = 0; i < enumType.members.length; i++) {

            emitEnumMember(enumType.members[i]);

            if(i != enumType.members.length - 1) {
                writer.write(",");
            }
            writer.writeLine();
        }

        writer.decreaseIndent();
        writer.write("}");
        writer.writeLine();
    }

    function emitEnumMember(member: EnumMember): void {

        writer.write(member.name);
        writer.write(" = ");
        writer.write("\"");
        writer.write(member.value);
        writer.write("\"");
    }

    function emitArrayType(arrayType: ArrayType): void {

        emitType(arrayType.elementType);
        writer.write("[]");
    }

    function emitUnionType(unionType: UnionType): void {

        // Since type arguments are not emitted, combine union members that are the same type expect for the binding
        var types = trimUnion(unionType);

        // If there is only one type in the union then emit without the union
        if(types.length == 1) {
            emitType(types[0]);
            return;
        }

        writer.write("(");

        for(var i = 0; i < types.length; i++) {

            emitType(types[i]);

            if(i != types.length - 1) {
                writer.write("|");
            }
        }

        writer.write(")");
    }

    function trimUnion(unionType: UnionType): Type[] {

        var types: Type[] = [];

        var lastTypeName: string;
        unionType.types.forEach(type => {

            if(lastTypeName === undefined || lastTypeName !== type.name) {
                types.push(type);
                lastTypeName = type.name;
            }
        });

        return types;
    }
}

export = emitFiles;
