import { z } from "zod";
export declare const RepositorySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    path: z.ZodString;
    branch: z.ZodString;
    hasSpecs: z.ZodBoolean;
    specCount: z.ZodNumber;
    status: z.ZodEnum<{
        active: "active";
        missing: "missing";
        archived: "archived";
    }>;
    scannedAt: z.ZodNumber;
    createdAt: z.ZodNumber;
}, z.core.$strip>;
export declare const PipelineStageSchema: z.ZodObject<{
    name: z.ZodEnum<{
        constitution: "constitution";
        spec: "spec";
        plan: "plan";
        tasks: "tasks";
        implementation: "implementation";
    }>;
    status: z.ZodEnum<{
        missing: "missing";
        draft: "draft";
        review: "review";
        approved: "approved";
        idle: "idle";
        running: "running";
    }>;
    filePath: z.ZodNullable<z.ZodString>;
    metadata: z.ZodOptional<z.ZodObject<{
        taskCount: z.ZodOptional<z.ZodNumber>;
        completedCount: z.ZodOptional<z.ZodNumber>;
        worktreeCount: z.ZodOptional<z.ZodNumber>;
        implementationProgress: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const SpecFolderSchema: z.ZodObject<{
    id: z.ZodString;
    repoPath: z.ZodString;
    name: z.ZodString;
    path: z.ZodString;
    stages: z.ZodArray<z.ZodObject<{
        name: z.ZodEnum<{
            constitution: "constitution";
            spec: "spec";
            plan: "plan";
            tasks: "tasks";
            implementation: "implementation";
        }>;
        status: z.ZodEnum<{
            missing: "missing";
            draft: "draft";
            review: "review";
            approved: "approved";
            idle: "idle";
            running: "running";
        }>;
        filePath: z.ZodNullable<z.ZodString>;
        metadata: z.ZodOptional<z.ZodObject<{
            taskCount: z.ZodOptional<z.ZodNumber>;
            completedCount: z.ZodOptional<z.ZodNumber>;
            worktreeCount: z.ZodOptional<z.ZodNumber>;
            implementationProgress: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    files: z.ZodArray<z.ZodString>;
    createdAt: z.ZodNumber;
}, z.core.$strip>;
export declare const SessionStateSchema: z.ZodObject<{
    selectedRepoPath: z.ZodNullable<z.ZodString>;
    selectedSpecPath: z.ZodNullable<z.ZodString>;
    selectedFilePath: z.ZodNullable<z.ZodString>;
    sidebarWidth: z.ZodNullable<z.ZodNumber>;
    activityPanelWidth: z.ZodNullable<z.ZodNumber>;
    activityPanelOpen: z.ZodBoolean;
    mainTab: z.ZodEnum<{
        flow: "flow";
        editor: "editor";
        worktrees: "worktrees";
    }>;
    updatedAt: z.ZodNumber;
}, z.core.$strip>;
export declare const IpcRequestSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"repo:list">;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"repo:scan">;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"spec:list">;
    repoPath: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"session:get">;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"session:update">;
    state: z.ZodObject<{
        selectedRepoPath: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        selectedSpecPath: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        selectedFilePath: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        sidebarWidth: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        activityPanelWidth: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        activityPanelOpen: z.ZodOptional<z.ZodBoolean>;
        mainTab: z.ZodOptional<z.ZodEnum<{
            flow: "flow";
            editor: "editor";
            worktrees: "worktrees";
        }>>;
        updatedAt: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"config:get">;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"config:add-working-dir">;
    path: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"config:remove-working-dir">;
    path: z.ZodString;
}, z.core.$strip>], "type">;
export declare const IpcResponseSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"repo:list:result">;
    repos: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        path: z.ZodString;
        branch: z.ZodString;
        hasSpecs: z.ZodBoolean;
        specCount: z.ZodNumber;
        status: z.ZodEnum<{
            active: "active";
            missing: "missing";
            archived: "archived";
        }>;
        scannedAt: z.ZodNumber;
        createdAt: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"repo:scan:started">;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"repo:scan:progress">;
    scanned: z.ZodNumber;
    total: z.ZodNumber;
    currentDir: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"repo:scan:complete">;
    repos: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        path: z.ZodString;
        branch: z.ZodString;
        hasSpecs: z.ZodBoolean;
        specCount: z.ZodNumber;
        status: z.ZodEnum<{
            active: "active";
            missing: "missing";
            archived: "archived";
        }>;
        scannedAt: z.ZodNumber;
        createdAt: z.ZodNumber;
    }, z.core.$strip>>;
    added: z.ZodNumber;
    updated: z.ZodNumber;
    missing: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"spec:list:result">;
    repoPath: z.ZodString;
    specs: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        repoPath: z.ZodString;
        name: z.ZodString;
        path: z.ZodString;
        stages: z.ZodArray<z.ZodObject<{
            name: z.ZodEnum<{
                constitution: "constitution";
                spec: "spec";
                plan: "plan";
                tasks: "tasks";
                implementation: "implementation";
            }>;
            status: z.ZodEnum<{
                missing: "missing";
                draft: "draft";
                review: "review";
                approved: "approved";
                idle: "idle";
                running: "running";
            }>;
            filePath: z.ZodNullable<z.ZodString>;
            metadata: z.ZodOptional<z.ZodObject<{
                taskCount: z.ZodOptional<z.ZodNumber>;
                completedCount: z.ZodOptional<z.ZodNumber>;
                worktreeCount: z.ZodOptional<z.ZodNumber>;
                implementationProgress: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        files: z.ZodArray<z.ZodString>;
        createdAt: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"spec:list:updated">;
    repoPath: z.ZodString;
    specs: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        repoPath: z.ZodString;
        name: z.ZodString;
        path: z.ZodString;
        stages: z.ZodArray<z.ZodObject<{
            name: z.ZodEnum<{
                constitution: "constitution";
                spec: "spec";
                plan: "plan";
                tasks: "tasks";
                implementation: "implementation";
            }>;
            status: z.ZodEnum<{
                missing: "missing";
                draft: "draft";
                review: "review";
                approved: "approved";
                idle: "idle";
                running: "running";
            }>;
            filePath: z.ZodNullable<z.ZodString>;
            metadata: z.ZodOptional<z.ZodObject<{
                taskCount: z.ZodOptional<z.ZodNumber>;
                completedCount: z.ZodOptional<z.ZodNumber>;
                worktreeCount: z.ZodOptional<z.ZodNumber>;
                implementationProgress: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        files: z.ZodArray<z.ZodString>;
        createdAt: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"session:response">;
    state: z.ZodObject<{
        selectedRepoPath: z.ZodNullable<z.ZodString>;
        selectedSpecPath: z.ZodNullable<z.ZodString>;
        selectedFilePath: z.ZodNullable<z.ZodString>;
        sidebarWidth: z.ZodNullable<z.ZodNumber>;
        activityPanelWidth: z.ZodNullable<z.ZodNumber>;
        activityPanelOpen: z.ZodBoolean;
        mainTab: z.ZodEnum<{
            flow: "flow";
            editor: "editor";
            worktrees: "worktrees";
        }>;
        updatedAt: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"session:updated">;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"config:response">;
    config: z.ZodObject<{
        workingDirs: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"config:updated">;
    config: z.ZodObject<{
        workingDirs: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"error">;
    message: z.ZodString;
}, z.core.$strip>], "type">;
export type IpcRequest = z.infer<typeof IpcRequestSchema>;
export type IpcResponse = z.infer<typeof IpcResponseSchema>;
