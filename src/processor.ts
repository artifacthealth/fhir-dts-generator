/// <reference path="../typings/node.d.ts" />
/// <reference path="../typings/async.d.ts" />
/// <reference path="../typings/glob.d.ts" />
/// <reference path="../typings/change-case.d.ts" />
/// <reference path="./types.d.ts" />

import fs = require("fs");
import async = require("async");
import glob = require("glob");
import changeCase = require("change-case");
import util = require("util");

export function processFiles(files: SpecificationFileMap): ProcessFilesResults {

    var maxNameLength = 56;

    var typesByName: { [name: string]: Type } = {};

    var result: ProcessFilesResults = {
        types: [],
        errors: []
    }

    var currentFile: SpecificationFile;

    // process all resource definitions
    for(var id in files) {
        var file = files[id];

        if(isResourceDefinition(file)) {
            referenceFile(file);
        }
    }

    return result;


    function addError(message: string, ...args: any[]) {

        var msg = util.format.apply(this, arguments);
        if(currentFile) {
            msg = currentFile.filename + ": " + msg;
        }
        result.errors.push(msg);
    }

    function isResourceDefinition(file: SpecificationFile): boolean {
        return file.content.resourceType == "StructureDefinition" && file.content.type == "resource";
    }

    function referenceFile(file: SpecificationFile): void {

        // flag file as referenced
        if(!file.referenced) {
            file.referenced = true;

            processFile(file);

            if(file.type) {
                // check for duplicate type names.
                if(typesByName[file.type.name]) {
                   addError("Duplicate type name '%s'.", file.type.name);
                }
                else {
                    typesByName[file.type.name] = file.type;
                }

                addTypeToResults(file.type);
            }
        }
    }

    function addTypeToResults(type: Type): void {

        result.types.push(type);
    }

    function processFile(file: SpecificationFile): void {

        if(file.processed || file.queued) return;
        file.queued = true;

        var oldFile = currentFile;
        currentFile = file;

        switch(file.content.resourceType) {
            case 'ValueSet':
                processValueSet(file);
                break;
            case 'StructureDefinition':
                processStructureDefinition(file);
                break;
        }

        file.processed = true;
        currentFile = oldFile;
    }

    function processValueSet(file: SpecificationFile): void {

        var type: EnumType = file.type = {
            name: getEnumName(file),
            kind: TypeKind.EnumType,
            description: file.content.description,
            members: []
        }

        // Pull in any codes that are defined in this value set
        var defined = file.content.define;
        if(defined) {
            combine(processCodes(defined));
        }

        // See if any codes are pulled in from elsewhere
        var compose = file.content.compose;
        if(compose) {
            // See if codes are included from another system
            var includes = compose.include;
            if(includes) {
                includes.forEach(item => combine(processInclude(item)));
            }

            // See if we import from another value set
            var imports = compose.import;
            if(imports) {
                imports.forEach(item => combine(processImport(item)));
            }
        }

        function combine(members: EnumMember[]): void {

            if(members) {
                members.forEach(member => {

                    if(adjustMemberName(member, type.members)) {
                        type.members.push(member)
                    }
                });
            }
        }
    }

    function adjustMemberName(memberToAdd: EnumMember, members: EnumMember[]): boolean {

        // Check if we have an duplicates. If not, we are good to go.
        var duplicateMember = getDuplicate(memberToAdd, members);
        if(!duplicateMember) {
            return true;
        }

        // we have a duplicate. if it's identical then ignore
        if(areEnumMembersEqual(duplicateMember, memberToAdd)) {
            return false;
        }

        var originalName = memberToAdd.name;

        // We have a duplicate. See if switching the name to an alternate value fixed the problem
        var alternate = getAlternateName(memberToAdd);
        if(alternate) {
            memberToAdd.name = alternate;
            if(!getDuplicate(memberToAdd, members)) {
                // Problem solved. Go ahead and add the enum member.
                return true;
            }

            // That didn't work. So try switching the name of the other member.
            alternate = getAlternateName(duplicateMember);
            if(alternate) {
                duplicateMember.name = alternate;
                if (!getDuplicate(memberToAdd, members)) {
                    // Problem solved. Go ahead and add the enum member.
                    return true;
                }
            }
        }

        // Still didn't work so we are just going to add an incrementing number to the name;
        var num = 1;
        do {
            memberToAdd.name = originalName + "_" + (num++);
        } while(getDuplicate(memberToAdd, members));

        return true;
    }

    function getDuplicate(memberToAdd: EnumMember, members: EnumMember[]): EnumMember {

        for(var i = 0; i < members.length; i++) {
            var currentMember = members[i];

            if(currentMember.name == memberToAdd.name) {
                return currentMember;
            }
        }
    }

    function areEnumMembersEqual(member1: EnumMember, member2: EnumMember): boolean {

        return member1.name === member2.name
            && member1.value === member2.value
            && member1.description === member2.description
            && member1.display === member2.display
            && member1.system === member2.system
            && member1.caseSensitive === member2.caseSensitive;
    }

    function processInclude(include: any): EnumMember[] {

        if(!include.system) {
            addError("Include statement missing system");
            return null;
        }

        // process any included codes substituting for original system if available
        var members = substituteCodesFromOriginalSystem(include.system, processCodes(include));

        // process any filters
        if(include.filter) {
            include.filter.forEach(filter => processFilter(include.system, filter, members));
        }

        return members;
    }

    function substituteCodesFromOriginalSystem(url: string, members: EnumMember[]): EnumMember[] {

        var file = getValueSetFile(url);
        if (file) {
            processFile(file);

            members = (<EnumType>file.type).members.filter((member) => {
                for(var i = 0; i < members.length; i++) {
                    if(members[i].value == member.value) return true;
                }
                return false;
            });
        }

        return members;
    }

    function processFilter(url: string, filter: any, members: EnumMember[]): void {

        var file = getValueSetFile(url);
        if (!file) return;

        if(filter.op != 'is-a') {
            addError("Do not know how to process filter operation '%s'.", filter.op);
            return;
        }

        if(filter.property != 'concept') {
            addError("Do not know how to process filter property '%s'.", filter.property);
            return;
        }

        processFile(file);

        (<EnumType>file.type).members.forEach(member => {

            if(enumMemberIsA(member, filter.value)) {
                members.push(member);
            }
        });
    }

    function enumMemberIsA(member: EnumMember, code: string): boolean {

        while(member) {
            if(member.value == code) return true;
            member = member.parent;
        }

        return false;
    }

    function processImport(url: string): EnumMember[] {

        var file = getValueSetFile(url);
        if(!file) {
            addError("Unable to process import statement for '%s' because value set with id '%s' could not be found.", file.filename, url);
        }
        else {
            processFile(file);

            var type = <EnumType>file.type;
            if(type) {
                return type.members;
            }
        }
    }

    function getValueSetFile(url: string): SpecificationFile {

        var file = files[url];
        if(!file) {
            // there are some inconsistencies in the url naming so if we can't find the file, try adding in 'vs' and
            // see if we can find it then
            var parts = url.split('/');
            parts.splice(parts.length - 1, 0, 'vs');
            file = files[parts.join('/')];
        }

        return file;
    }

    function processCodes(codes: any): EnumMember[] {

        var system = codes.system;
        var caseSensitive = codes.caseSensitive;
        var members: EnumMember[] = [];

        processConcepts(codes.concept);
        return members;

        function processConcepts(concepts: any, parent?: EnumMember): void {
            if(concepts) {
                for (var j = 0; j < concepts.length; j++) {
                    var concept = concepts[j];

                    var member: EnumMember = {
                        name: getEnumMemberName(system, concept),
                        description: getEnumMemberDescription(concept),
                        value: concept.code,
                        system: system,
                        caseSensitive: caseSensitive,
                        parent: parent
                    }

                    var display = concept.display && concept.display.trim();
                    if(display) {
                        member.display = display;
                    }

                    members.push(member);

                    // see if we have child codes
                    processConcepts(concept.concept, member);
                }
            }
        }
    }

    function getEnumName(file: SpecificationFile): string {

        // Get the name from the content
        var name: string = file.content.name;

        // If the name is not defined in the content or is not valid then try using the first referencing symbol
        if(!name || name.indexOf(" ") != -1) {
            name = file.symbol;
        }

        // If it has never been referenced then take the name from the URL
        if(!name) {
            return getNameFromSystemUrl(file.id);
        }

        return formatName(name);
    }

    function getNameFromSystemUrl(url: string): string {

        var parts = url.split('/');
        name = parts[parts.length-1];
        return formatName(name);
    }

    function getAlternateName(member: EnumMember): string {

        var name: string;

        // If the code does not start with a number, use that.
        if(member.value && !startsWithNumber(member.value)) {
            name = member.value;
        }
        else {
            // Otherwise, check to see if we can use the description
            if (member.description && member.description.length < maxNameLength) {
                name = member.description;
            }
        }

        if(name) {
            return formatName(name);
        }
    }

    function getEnumMemberName(system: string, concept: any): string {

        var name: string;

        // Check for pre-defined mapped names for problem codes
        name = getMappedName(system, concept.code);
        if(!name) {
            // use the display as the name if we have one
            var display = concept.display && concept.display.trim();
            if(display && display.length < maxNameLength) {
                name = concept.display;

                // replace the symbol * with the word Star
                name = name.replace("*", "Star");
            }
            else {
                // use the code if it doesn't start with a number
                var code = concept.code;
                if(code && !startsWithNumber(code)) {
                    name = code;
                }
                else {
                    // If the code started with a number, then see about using the description
                    var description = getEnumMemberDescription(concept);
                    description = description && description.trim();
                    if (description && description.length < maxNameLength) {
                        name = description;
                    }
                    else {
                        // Last option is to use the code as the name
                        name = code;
                    }
                }
            }
        }

        if(!name) {
            addError("Unable to determine name for value set concept.");
            return null;
        }

        return formatName(name);
    }

    function getMappedName(system: string, code: string): string {

        switch(code) {
            case "<":
                return "LessThan";
            case "<=":
                return "LessThanOrEqual";
            case ">":
                return "GreaterThan";
            case ">=":
                return "GreaterThanOrEqual";
        }
    }

    function formatName(name: string): string {

        name = changeCase.pascalCase(name);

        // prepend underscore if name starts with a number
        if(startsWithNumber(name)) {
            name = "_" + name;
        }

        return name;
    }

    function startsWithNumber(text: string): boolean {

        return isNumberCharacter(text.charCodeAt(0));
    }

    function isNumberCharacter(charCode: number): boolean {

        return charCode >= 48 && charCode <= 57;
    }

    function getEnumMemberDescription(concept: any): string {

        if(concept.definition ) return concept.definition;

        var definitionExtension = getExtensionValueString(concept, "http://hl7.org/fhir/StructureDefinition/valueset-definition");
        if(definitionExtension) {
            return definitionExtension;
        }

        if(concept.display && concept.display.indexOf(" ") != -1) {
            return concept.display;
        }
    }

    function getExtensionValueString(element: any, url: string): string {

        var extension = getExtension(element, url);
        if(extension) {
            return extension.valueString;
        }
    }

    function getExtension(element: any, url: string): any {

        if(element.extension) {

            for(var i = 0; i < element.extension.length; i++) {
                var item = element.extension[i];
                if(item.url == url) {
                    return item;
                }
            }
        }
    }

    function processStructureDefinition(file: SpecificationFile): void {

        switch(file.content.type) {
            case 'resource':
                processResource(file);
                break;
            case 'type':
                processType(file);
                break;
        }
    }

    function processResource(file: SpecificationFile): void {

        processTypeDefinition(file);
    }

    function processType(file: SpecificationFile): void {

        if(isPrimitive(file)) {
            processPrimitive(file);
        }
        else {
            processTypeDefinition(file);
        }
    }

    function isPrimitive(file: SpecificationFile): boolean {

        var elements = file.content.differential.element;
        for (var i = 0; i < elements.length; i++) {
            var element = elements[i];
            if(element.short.indexOf("Primitive") != -1) return true;
        }
        return false;
    }

    function processPrimitive(file: SpecificationFile): void {


    }

    function processTypeDefinition(file: SpecificationFile): void {

        var type = file.type = createInterfaceType(file.content.id);

        var elements = file.content.differential.element;
        for(var i = 0; i < elements.length; i++) {
            var element = elements[i];

            if(element.path == type.name) {
                // element that has resource details
                type.description = element.short;
                type.baseType = getElementTypeName(element);

                if(type.baseType) {
                    // Make sure we know the base type
                    var baseType = files[type.baseType];
                    if(!baseType) {
                        addError("Unknown base type '%s'.", type.baseType);
                        return;
                    }
                }
                else {
                    if(type.name != "Element") {
                        type.baseType = "Element";
                    }
                }
            }
            else {
                // element has property details
                var propertyName = getPropertyName(element);
                if(!propertyName) {
                    addError("Missing property name for element %d.", i);
                    return;
                }

                var containingType = getContainingTypeForElement(type, element);
                if (!containingType) {
                    addError("Error getting containing type for property '%s': ", propertyName);
                    return;
                }

                if(propertyName.length > 3 && propertyName.indexOf("[x]") == propertyName.length - 3) {

                    var typeReferences = getTypeReferences(element.type);
                    if (!typeReferences) {
                        addError("No types specified for '%s'.", propertyName);
                        return;
                    }

                    typeReferences.forEach((x: TypeReference) => addProperty(combinePropertyNameWithType(propertyName, x.name), x));
                }
                else {
                    var propertyType = getPropertyTypeForElement(element);
                    if (!propertyType) {
                        addError("Error getting type for property '%s'.", propertyName);
                        return;
                    }

                    addProperty(propertyName, propertyType);
                }
            }
        }

        function addProperty(name: string, propertyType: Type): void {
            containingType.properties.push({
                name: name,
                description: element.short,
                type: propertyType,
                optional: element.min == 0
            });
        }
    }

    function combinePropertyNameWithType(propertyName: string, typeName: string): string {

        return propertyName.replace("[x]", changeCase.pascalCase(typeName));
    }

    function getElementTypeName(element: any): string {

        if(!element.type || !element.type.length) return null;

        return element.type[0].code;
    }

    function getPropertyName(element: any): string {

        var path = element.path;
        if(path) {
            var parts = path.split(".");
            return parts[parts.length-1];
        }
    }

    function getContainingTypeForElement(resourceType: InterfaceType, element: any): ObjectType {

        var path = element.path;
        if(!path) return null;

        var parts = path.split(".");
        var resourceName = parts.shift();
        if(resourceName != resourceType.name) {
            addError("Expected '%s' to be '%s'.", resourceName, resourceType.name);
            return null;
        }

        return getContainingTypeForPath(resourceType, parts);
    }

    function getContainingTypeForPath(parentType: ObjectType, path: string[]): ObjectType {

        if(path.length == 1) return parentType;

        var propertyName = path.shift();
        var property = getPropertyForType(parentType, propertyName);
        if(!property) {
            addError("Could not find property '%s' on type '%s'.", propertyName, parentType.name);
            return null;
        }

        var currentType = property.type;
        while(currentType.kind == TypeKind.ArrayType) {
            currentType = (<ArrayType>currentType).elementType;
        }

        if(!(currentType.kind & TypeKind.ObjectTypes)) {
            addError("Expected '%s' to be an object or array type.", propertyName);
            return null;
        }

        return getContainingTypeForPath(<ObjectType>currentType, path);
    }

    function getPropertyForType(objectType: ObjectType, propertyName: string): Property {

        for(var i = 0; i < objectType.properties.length; i++) {
            if(objectType.properties[i].name == propertyName) return objectType.properties[i];
        }

        return null;
    }

    function getPropertyTypeForElement(element: any): Type {

        var elementType: Type;

        var typeReferences = getTypeReferences(element.type);
        if(!typeReferences || typeReferences.length == 0) {
            // If no type is specified then create an empty object type
            elementType = createObjectType();
        }
        else if(typeReferences.length == 1) {
            elementType = typeReferences[0];
        }
        else {
            elementType = createUnionType(typeReferences);
        }

        if(element.max != "1") {
            return createArrayType(elementType);
        }

        return elementType;

    }

    function getTypeReferences(types: any[]): TypeReference[] {

        if (!types) {
            return null;
        }

        if (!Array.isArray(types)) {
            addError("Expected array of types.");
            return null;
        }

        var result: TypeReference[] = [];

        // shallow clone type elements array
        var typeElements: any[] = [].concat(types);

        for (var i = 0; i < typeElements.length; i++) {
            var typeElement = typeElements[i];

            var typeName = typeElement.code;
            if (!typeName) {
                addError("Missing type name.");
                return null;
            }

            // check that we have a valid type name
            if (typeName == '*') {
                // if we have a wildcard add list of types that represent the open type element to the end of the
                // array and then skip processing for this item.
                typeElements.concat(openTypeElement);
                continue;
            }
            else if (typeName == 'xhtml') {
                typeName = "string";
            }
            else if (!getFileForType(typeName)) {
                // if type name is not valid then skip processing.
                return null;
            }

            var elementType = createTypeReference(typeName);

            // check if we have a binding that is not an example binding
            if (typeElement.binding && !isExampleBinding(typeElement.binding)) {

                var bindingReference = getBindingReference(typeElement.binding);
                if (bindingReference) {
                    elementType.binding = bindingReference;
                }
            }

            result.push(elementType);
        }

        return result;
    }

    function getFileForType(name: string): SpecificationFile {

        var elementTypeFile = files[name];
        if (!elementTypeFile) {
            addError("Unknown type '%s'.", name);
            return null;
        }

        referenceFile(elementTypeFile);

        return elementTypeFile;
    }

    function getBindingReference(binding: any): string {

        var valueSetReference = binding.valueSetReference;
        if (valueSetReference && valueSetReference.reference) {

            var bindingTypeFile = getValueSetFile(valueSetReference.reference);
            if (!bindingTypeFile) {
                addError("Unknown binding reference '%s'.", valueSetReference.reference);
                return null;
            }

            // check to see if the referenced value set appears to be an example even if not specified in
            // the binding.
            if(!isApparentExampleValueSet(bindingTypeFile)) {
                // In-case the value set does not define a valid symbol name in the resource so get it from the
                // binding the first time it's used.
                if(!bindingTypeFile.symbol) {
                    bindingTypeFile.symbol = binding.name;
                }

                // queue the binding reference for processing.
                referenceFile(bindingTypeFile);

                return valueSetReference.reference;
            }
        }
    }

    function isExampleBinding(binding: any): boolean {
        return binding.strength == "example";
    }

    function isApparentExampleValueSet(file: SpecificationFile): boolean {
        return file.content.copyright == "This is an example set"
    }

    function createArrayType(elementType: Type): ArrayType {
        return {
            kind: TypeKind.ArrayType,
            elementType: elementType
        }
    }

    function createTypeReference(name: string, binding?: string): TypeReference {
        return {
            name: name,
            binding: binding,
            kind: TypeKind.TypeReference
        }
    }

    function createInterfaceType(name: string): InterfaceType {
        return {
            kind: TypeKind.InterfaceType,
            name: name,
            properties: []
        }
    }

    function createObjectType(): ObjectType {
        return {
            kind: TypeKind.ObjectType,
            properties: []
        }
    }

    function createUnionType(types: Type[]): UnionType {
        return {
            kind: TypeKind.UnionType,
            types: types
        }
    }

}

var openTypeElement: any = [
    {
        code: "integer"
    },
    {
        code: "decimal"
    },
    {
        code: "dateTime"
    },
    {
        code: "date"
    },
    {
        code: "instant"
    },
    {
        code: "time"
    },
    {
        code: "string"
    },
    {
        code: "uri"
    },
    {
        code: "boolean"
    },
    {
        code: "code"
    },
    {
        code: "base64Binary"
    },
    {
        code: "Coding"
    },
    {
        code: "CodeableConcept"
    },
    {
        code: "Attachment"
    },
    {
        code: "Identifier"
    },
    {
        code: "Quantity"
    },
    {
        code: "Range"
    },
    {
        code: "Period"
    },
    {
        code: "Ratio"
    },
    {
        code: "HumanName"
    },
    {
        code: "Address"
    },
    {
        code: "ContactPoint"
    },
    {
        code: "Timing"
    },
    {
        code: "Signature"
    },
    {
        code: "Reference"
    }
];
