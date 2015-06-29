interface Callback {
    (err?: Error): void;
}

interface ResultCallback<T> {
    (err?: Error, result?: T): void;
}

interface SpecificationFile {

    id: string;
    filename: string;
    queued?: boolean;
    processed?: boolean;
    referenced?: boolean;

    symbol?: string;
    content?: any;
    type?: Type;
}

interface SpecificationFileMap {

    [id: string]: SpecificationFile;
}

interface Type {

    kind: TypeKind;
    name?: string;
    description?: string;
}

interface ObjectType extends Type {

    properties: Property[];
}

interface InterfaceType extends ObjectType {

    baseType?: string;
}

interface EnumType extends Type {

    members: EnumMember[];
}

interface TypeReference extends Type {

    binding?: string;
}

interface ArrayType extends Type {

    elementType: Type;
}

interface UnionType extends Type {

    types: Type[];
}

declare const enum TypeKind {

    TypeReference,
    ObjectType,
    InterfaceType,
    EnumType,
    ArrayType,
    UnionType,
    ObjectTypes = InterfaceType | ObjectType
}

interface Property {

    name: string;
    description: string;
    type: Type;
    optional: boolean;
}

interface EnumMember {

    name: string;
    description?: string;
    value: string;

    display?: string;
    system?: string;
    caseSensitive?: boolean;
    parent?: EnumMember;
}

interface CreateFileMapResults {

    files: SpecificationFileMap;
    errors: string[];
}

interface ProcessFilesResults {

    types: Type[];
    errors: string[];
}

interface EmitResults {

    errors: string[];
}