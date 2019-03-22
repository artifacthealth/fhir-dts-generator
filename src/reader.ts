/// <reference path="../typings/node.d.ts" />
/// <reference path="../typings/glob.d.ts" />
/// <reference path="./types.d.ts" />

import fs = require("fs");
import glob = require("glob");
import util = require("util");
import path = require("path");

export function readSpecification(basePath: string): CreateFileMapResults {

    var result: CreateFileMapResults = {
        files: {},
        errors: []
    }

    var currentFile: string;

    try {
        var files = glob.sync(path.join(basePath, "**/*.json"));
    }
    catch(err) {
        addError("Error reading directory '%s': %s.", basePath, err.message);
    }

    if(files) {
        for (var i = 0; i < files.length; i++) {
            currentFile = files[i];

            // skip canonical files and diff files
            if (currentFile.indexOf(".canonical.json") != -1 || currentFile.indexOf(".diff.json") != -1) {
                continue;
            }

            processFile(currentFile, readFile(currentFile));
        }
    }

    return result;

    function addError(message: string, ...args: any[]): void {

        var msg = util.format.apply(this, arguments);
        if(currentFile) {
            msg = currentFile + ": " + msg;
        }
        result.errors.push(msg);
    }

    function readFile(filename: string): string {

        try {
            return JSON.parse(fs.readFileSync(filename, 'utf8'));
        }
        catch(err) {
            addError(err.message);
        }
    }

    function processFile(filename: string, content: any): void {

//        console.log("processFile " + filename + " - " + content);

        if (!content) return;

        // only process value sets and structure definitions
        if(content.resourceType != "ValueSet" && content.resourceType != "StructureDefinition" && content.resourceType != "CodeSystem") {
//            console.log("skipping because no vs, sd or cs "+filename)
            return;
        }

        // skip files that are of resource type StructureDefinition but do not contain '.profile' in their name
        if(content.resourceType == "StructureDefinition" && filename.indexOf(".profile") == -1) {
  //          console.log("skipping because no vad and no .profile "+filename)
            return;
        }

        // skip files that do not define an id
        var id = getContentId(content);
        if(!id) {
  //          console.log("skipping beaus no id "+filename)
            return;
        }

        if(result.files[id]) {
            addError("Duplicate id '%s' already defined in file '%s'.", id, result.files[id].filename);
            return;
        }

  //      console.log("addidng"+filename+" id "+id);

        result.files[id] = {
            id,
            filename,
            content
        }
    }

    function getContentId(content: any): string {
        if(!content) return null;

        if(content.resourceType == 'ValueSet' || content.resourceType == 'CodeSystem') return content.url;

        return content.id;
    }
}