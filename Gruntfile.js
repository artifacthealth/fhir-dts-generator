module.exports = function(grunt) {

    require('load-grunt-tasks')(grunt);

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON("package.json"),

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

        ts_clean: {
            build: {
                options: {
                    // set to true to print files
                    verbose: false
                },
                src: ['build/src/**/*'],
                dot: true
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

        tsreflect: {
            services: {
                src: [
                    "src/services/**/*.ts"
                ],
                dest: "build/src/services/"
            },
            domain: {
                src: [
                    "src/domain/**/*.ts"
                ],
                dest: "build/src/domain/"
            }
        }
    });

    // Default task(s).
    grunt.registerTask("default", [ "clean:build", "typescript:build", "copy:build", "ts_clean:build" ]);
};