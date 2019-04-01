module.exports = function(grunt) {

    grunt.loadNpmTasks('grunt-if-missing');

    require('load-grunt-tasks')(grunt);

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON("package.json"),

        'request-progress': {
            'download-specification': {
                options: {
                    allowOverwrite: false,
                    src: 'http://www.hl7.org/fhir/R4/fhir-spec-r4.zip',
                    dst: 'specification/fhir-spec.zip'
                }
            }
        },

        unzip: {
            'specification/fhir-spec/': 'specification/fhir-spec.zip'
        },

        clean: {
            build: {
                src: [
                    "build/src"
                ]
            }
        },

        typescript: {
            build: {
                options: {
                    module: "commonjs",
                    target: "es5",
                    sourceMap: true,
                    rootDir: "src/"
                },
                src: [
                    "src/**/*.ts"
                ],
                dest: "build/src/"
            }
        },

        copy: {
            build: {
                files: [
                    /* General */
                    {
                        expand: true,
                        src: [
                            'package.json'
                        ],
                        dest: 'build/src/'
                    }
                ]
            }
        },

        execute: {
            generate: {
                src: [ 'build/src/main.js' ]
            }
        }


    });

    // Default task(s).
    grunt.registerTask("default", [ "setup", "build", "generate" ]);
    grunt.registerTask("setup", [ "request-progress:download-specification", "if-missing:unzip" ]);
    grunt.registerTask("build", [ "clean:build", "typescript:build", "copy:build" ]);
    grunt.registerTask("generate", [ "execute:generate" ]);
};