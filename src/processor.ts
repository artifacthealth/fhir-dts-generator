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
        if(file.content.resourceType == "StructureDefinition") {
            return (<fhir.StructureDefinition>file.content).type == "resource";
        }
        return false;
    }

    function referenceFile(file: SpecificationFile): void {

        // flag file as referenced
        if(!file.referenced) {
            file.referenced = true;

            if(file.id == "Money") debugger;
            processFile(file);

            if(file.type) {
                addTypeToResults(file.type);
            }
        }
    }

    function addTypeToResults(type: Type): void {

        // check for duplicate type names.
        if(typesByName[type.name]) {
            addError("Duplicate type name '%s'.", type.name);
        }
        else {
            typesByName[type.name] = type;
        }

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

        var content = <fhir.ValueSet>file.content;

        var type: EnumType = file.type = {
            category: TypeCategory.ValueSet,
            name: getEnumName(file),
            kind: TypeKind.EnumType,
            description: content.description,
            members: []
        }

        // Pull in any codes that are defined in this value set
        var defined = content.define;
        if(defined) {
            combine(processCodes(defined));
        }

        // See if any codes are pulled in from elsewhere
        var compose = content.compose;
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

    function processInclude(include: fhir.ValueSetComposeInclude): EnumMember[] {

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

    function processFilter(url: string, filter: fhir.ValueSetComposeIncludeFilter, members: EnumMember[]): void {

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

    function processCodes(codes: fhir.ValueSetDefine): EnumMember[] {

        var system = codes.system;
        var caseSensitive = codes.caseSensitive;
        var members: EnumMember[] = [];

        processConcepts(codes.concept);
        return members;

        function processConcepts(concepts: fhir.ValueSetDefineConcept[], parent?: EnumMember): void {
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

        var content = <fhir.ValueSet>file.content;

        // Get the name from the content
        var name: string = content.name;

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

    function getEnumMemberName(system: string, concept: fhir.ValueSetDefineConcept): string {

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
            case "=":
                return "Equals";
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

    function getEnumMemberDescription(concept: fhir.ValueSetDefineConcept): string {

        if(concept.definition ) return concept.definition;

        var definitionExtension = getExtensionValueString(concept, "http://hl7.org/fhir/StructureDefinition/valueset-definition");
        if(definitionExtension) {
            return definitionExtension;
        }

        if(concept.display && concept.display.indexOf(" ") != -1) {
            return concept.display;
        }
    }

    function getExtensionValueString(element: fhir.Element, url: string): string {

        var extension = getExtension(element, url);
        if(extension) {
            return extension.valueString;
        }
    }

    function getExtension(element: fhir.Element, url: string): any {

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

        switch((<fhir.StructureDefinition>file.content).type) {
            case 'resource':
                processResource(file);
                break;
            case 'constraint':
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

        var elements = (<fhir.StructureDefinition>file.content).differential.element;
        for (var i = 0; i < elements.length; i++) {
            var element = elements[i];
            if(element.short.indexOf("Primitive") != -1) return true;
        }
        return false;
    }

    function processPrimitive(file: SpecificationFile): void {

        var type = file.type = createPrimitiveType(file.content.id);
    }

    function processTypeDefinition(file: SpecificationFile): void {

        var content = <fhir.StructureDefinition>file.content;
        var type = file.type = createInterfaceType(content.id, isResourceDefinition(file) ? TypeCategory.Resource : TypeCategory.DataType);

        var elements = content.differential.element;
        for(var i = 0; i < elements.length; i++) {
            var element = elements[i];

            if(element.path.indexOf(".") == -1) {
                // element that has resource details
                type.description = element.short;

                if(type.name != "Element") {
                    type.baseType = getElementTypeName(element);

                    if (type.baseType) {
                        // Make sure we know the base type
                        var baseTypeFile = files[type.baseType];
                        if (!baseTypeFile) {
                            addError("Unknown base type '%s'.", type.baseType);
                            return;
                        }
                        referenceFile(baseTypeFile);
                    }
                    else {
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

                    var lastProperty: Property,
                        lastTypeReferenceName: string;

                    for(var j = 0; j < typeReferences.length; j++) {
                        var typeReference = typeReferences[j];

                        // If the reference has the same type as the last one, combine the type of the property into a
                        // union type
                        if(lastTypeReferenceName === typeReference.name) {
                            if(lastProperty.type.kind == TypeKind.UnionType) {
                                (<UnionType>lastProperty.type).types.push(typeReference);
                            }
                            else {
                                lastProperty.type = createUnionType([lastProperty.type, typeReference]);
                            }
                        }
                        else {
                            // otherwise, add a new property for the type
                            lastProperty = addProperty(combinePropertyNameWithType(propertyName, typeReference.name), typeReference, /*optional*/ true);
                            lastTypeReferenceName = typeReference.name;
                        }
                    }
                }
                else {
                    var propertyType = getPropertyTypeForElement(type, element);
                    if (!propertyType) {
                        addError("Error getting type for property '%s'.", propertyName);
                        return;
                    }

                    addProperty(propertyName, propertyType);
                }
            }
        }

        function addProperty(name: string, propertyType: Type, optional?: boolean): Property {
            var property: Property = {
                name: name,
                description: element.short,
                type: propertyType,
                optional: optional === undefined ? element.min == 0 : optional
            }
            containingType.properties.push(property);
            return property;
        }
    }

    function combinePropertyNameWithType(propertyName: string, typeName: string): string {

        return propertyName.replace("[x]", changeCase.pascalCase(typeName));
    }

    function getElementTypeName(element: any): string {

        if(!element.type || !element.type.length) return null;

        return element.type[0].code;
    }

    function getPropertyName(element: fhir.ElementDefinition): string {

        var path = element.path;
        if(path) {
            var parts = path.split(".");
            return parts[parts.length-1];
        }
    }

    function getContainingTypeForElement(resourceType: InterfaceType, element: fhir.ElementDefinition): ObjectType {

        var path = element.path;
        if(!path) return null;

        var parts = path.split(".");
        var resourceName = parts.shift();
        if(!hasBaseInterface(resourceType, resourceName)) {
            addError("Expected '%s' to be a '%s'.", resourceName, resourceType.name);
            return null;
        }

        return getContainingTypeForPath(resourceType, parts);
    }

    function hasBaseInterface(interfaceType: InterfaceType, name: string): boolean {

        var baseType = interfaceType;

        while(baseType) {
            if(baseType.name == name) return true;
            baseType = <InterfaceType>getTypeByName(baseType.baseType);
        }

        return false;
    }

    function getContainingTypeForPath(parentType: ObjectType, path: string[]): ObjectType {

        if(path.length == 1) return parentType;

        var propertyName = path.shift();
        var property = getPropertyForType(parentType, propertyName);
        if(!property) {
            addError("Could not find property '%s' on type '%s'.", propertyName, parentType.name);
            return null;
        }

        var currentType = getReferencedType(property.type);
        if(!currentType) {
            return null;
        }
        if(!(currentType.kind & TypeKind.ObjectTypes)) {
            addError("Expected property '%s' to reference an object type.", propertyName);
            return null;
        }

        return getContainingTypeForPath(<ObjectType>currentType, path);
    }

    function getReferencedType(currentType: Type, category?: TypeCategory): Type {

        if(currentType) {

            while (currentType.kind == TypeKind.ArrayType) {
                currentType = (<ArrayType>currentType).elementType;
            }

            if (currentType.kind == TypeKind.TypeReference) {
                var referencedName = (<TypeReference>currentType).name;

                currentType = getTypeByName(referencedName);
                if (!currentType) {
                    addError("Could not find type with name '%s'.", referencedName);
                    return null;
                }

                // restrict to type category if specified
                if(category && (currentType.category & category) == 0) {
                    return null;
                }
            }
        }

        return currentType;
    }

    function getTypeByName(name: string): Type {

        // See if the type has already been created
        var ret = typesByName[name];
        if(!ret) {
            // If not, check if we have a file for it
            var referencedFile = files[name];
            if (referencedFile) {
                // We have the file but not the type so process the file
                referenceFile(referencedFile);
                ret = referencedFile.type;
            }
        }

        return ret;
    }

    function getPropertyForType(objectType: ObjectType, propertyName: string): Property {

        for(var i = 0; i < objectType.properties.length; i++) {
            if(objectType.properties[i].name == propertyName) return objectType.properties[i];
        }

        return null;
    }

    function getPropertyTypeForElement(rootType: ObjectType, element: fhir.ElementDefinition): Type {

        var elementType: Type;

        if(element.nameReference) {
            elementType = getReferencedType(findTypeOfFirstProperty(rootType, element.nameReference, []));
            if(!elementType) {
                addError("Could not resolve name reference '%s'.", element.nameReference);
                return null;
            }

            if(elementType.kind != TypeKind.InterfaceType) {
                addError("Expected name reference to resolve to an interface type.");
            }

            // create a reference to the interface type
            elementType = createTypeReference((<InterfaceType>elementType).name);
        }
        else {
            var typeReferences = getTypeReferences(element.type);
            if (!typeReferences || typeReferences.length == 0) {
                // If no type is specified then create a reference to a sub-type
                elementType = createSubType(element);
            }
            else if (typeReferences.length == 1) {
                elementType = typeReferences[0];
            }
            else {
                elementType = createUnionType(typeReferences);
            }

            // check if we have a binding that is not an example binding
            if (element.binding && !isExampleBinding(element.binding)) {
                var bindingReference = getBindingReference(element.binding);
                if (bindingReference) {
                    if (elementType.kind != TypeKind.TypeReference) {
                        addError("Expected type reference");
                    }
                    else {
                        (<TypeReference>elementType).binding = bindingReference;
                    }
                }
            }
        }

        if(element.max != "1") {
            return createArrayType(elementType);
        }

        return elementType;
    }

    function createSubType(element: fhir.ElementDefinition): TypeReference {

        var subTypeName = changeCase.pascalCase(element.path);
        var subType = createInterfaceType(subTypeName, TypeCategory.SubType);

        subType.description = element.short;
        subType.baseType = "Element"; // all sub-types derive from Element

        addTypeToResults(subType);

        return createTypeReference(subTypeName);
    }

    function findTypeOfFirstProperty(type: ObjectType, name: string, checked: Type[]): Type {

        if(type && type.properties) {

            if(checked.indexOf(type) != -1) return null;
            checked.push(type);

            for (var i = 0; i < type.properties.length; i++) {
                var property = type.properties[i];

                var propertyType = property.type;
                if (property.name == name) {
                    return propertyType;
                }

                propertyType = getReferencedType(propertyType, TypeCategory.SubType);
                if (propertyType && (propertyType.kind & TypeKind.ObjectTypes)) {
                    var match = findTypeOfFirstProperty(<ObjectType>propertyType, name, checked);
                    if (match) {
                        return match;
                    }
                }
            }
        }
    }

    function getTypeReferences(types: fhir.ElementDefinitionType[]): TypeReference[] {

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
                typeElements = typeElements.concat(openTypeElement);
                continue;
            }
            else if (typeName == 'xhtml') {
                typeName = "string";
            }
            else if (!getFileForType(typeName)) {
                // if type name is not valid then skip processing.
                return null;
            }

            var typeReference = createTypeReference(typeName);

            if (typeElement.profile) {
                var resourceName = getResourceNameFromProfile(typeElement.profile);
                if(resourceName) {
                    var resourceFile = files[resourceName];
                    if(!resourceFile) {
                        addError("Unknown profile '%s'.", resourceName);
                    }
                    else {
                        referenceFile(resourceFile);
                    }

                    typeReference.binding = resourceName;
                }
            }

            result.push(typeReference);
        }

        return result;
    }

    function getResourceNameFromProfile(profile: string): string {

        var base = "http://hl7.org/fhir/StructureDefinition/";

        if(profile.indexOf(base) == -1) {
            addError("Unrecognized profile uri");
            return null;
        }

        return profile.substring(base.length);
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

    function getBindingReference(binding: fhir.ElementDefinitionBinding): string {

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

                return bindingTypeFile.type.name;
            }
        }
    }

    function isExampleBinding(binding: fhir.ElementDefinitionBinding): boolean {
        return binding.strength == "example";
    }

    function isApparentExampleValueSet(file: SpecificationFile): boolean {
        return (<fhir.ValueSet>file.content).copyright == "This is an example set"
    }

    function createArrayType(elementType: Type): ArrayType {
        return {
            category: TypeCategory.None,
            kind: TypeKind.ArrayType,
            elementType: elementType
        }
    }

    function createTypeReference(name: string): TypeReference {
        return {
            category: TypeCategory.None,
            name: name,
            kind: TypeKind.TypeReference
        }
    }

    function createInterfaceType(name: string, category: TypeCategory): InterfaceType {
        return {
            category: category,
            kind: TypeKind.InterfaceType,
            name: name,
            properties: []
        }
    }

    function createObjectType(): ObjectType {
        return {
            category: TypeCategory.None,
            kind: TypeKind.ObjectType,
            properties: []
        }
    }

    function createPrimitiveType(name: string): Type {
        return {
            category: TypeCategory.Primitive,
            kind: TypeKind.Primitive,
            name: name
        }
    }

    function createUnionType(types: Type[]): UnionType {
        return {
            category: TypeCategory.None,
            kind: TypeKind.UnionType,
            types: types
        }
    }

}

var openTypeElement: fhir.ElementDefinitionType[] = [
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
