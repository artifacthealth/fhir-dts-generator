interface Callback {
    (err?: Error): void;
}

interface ResultCallback<T> {
    (err?: Error, result?: T): void;
}

interface ResourceBase {
    /**
     * The type of the resource.
     */
    resourceType?: string;
    /**
     * Contains extended information for property 'resourceType'.
     */
    _resourceType?: Element;
    /**
     * Logical id of this artifact
     */
    id?: string;
    /**
     * Contains extended information for property 'id'.
     */
    _id?: Element;
    /**
     * Metadata about the resource
     */
 //   meta?: Meta;
    /**
     * A set of rules under which this content was created
     */
//    implicitRules?: uri;
    /**
     * Contains extended information for property 'implicitRules'.
     */
 //   _implicitRules?: Element;
    /**
     * Language of the resource content
     */
 //   language?: code;
    /**
     * Contains extended information for property 'language'.
     */
 //   _language?: Element;
}

/**
  * A resource with narrative, extensions, and contained resources
  */
interface DomainResource extends ResourceBase {
    /**
     * Text summary of the resource, for human interpretation
     */
//    text?: Narrative;
    /**
     * Contained, inline Resources
     */
//    contained?: Resource[];
    /**
     * Additional Content defined by implementations
     */
//    extension?: Extension[];
    /**
     * Extensions that cannot be ignored
     */
//    modifierExtension?: Extension[];
}

interface SpecificationFile {

    id: string;
    filename: string;
    queued?: boolean;
    processed?: boolean;
    referenced?: boolean;

    symbol?: string;
    content?: DomainResource;
    type?: Type;
}

interface SpecificationFileMap {

    [id: string]: SpecificationFile;
}

interface Type {

    kind: TypeKind;
    category: TypeCategory;
    name?: string;
    description?: string;
}

interface PrimitiveType extends Type {

    intrinsicType: string;
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

interface AliasType extends Type {

    type: Type;
}

declare const enum TypeKind {

    TypeReference = 1,
    ObjectType = 2,
    InterfaceType = 4,
    EnumType = 8,
    ArrayType = 16,
    UnionType = 32,
    Primitive = 64,
    AliasType = 128,
    ObjectTypes = InterfaceType | ObjectType,
    RootTypes = Primitive | ObjectTypes | EnumType | AliasType
}

declare const enum TypeCategory {

    None = 0,
    Primitive,
    DataType,
    Resource,
    SubType,
    ValueSet,
    CodeSystem
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


interface Reference<T> {
    reference: string;
    display: string;
}