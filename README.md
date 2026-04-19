# Construct CLI

Build, develop, and publish Construct spaces.

## Install

```bash
bun install -g construct
```

## Commands

### Space Development

```bash
construct scaffold my-space    # Create a new space
construct dev                  # Dev mode with hot reload
construct build                # Build for production
construct run                  # Install locally
construct publish              # Publish to registry
construct validate             # Validate manifest
construct check                # Type-check + lint
construct clean                # Remove build artifacts
```

### Graph (Data Models)

```bash
construct graph init                              # Add Graph to your space
construct graph g User name:string email:string   # Generate a model
construct graph push                              # Register models with Graph
construct graph migrate                           # Diff + apply schema changes
```

#### Publisher commands

Group related spaces under a **bundle**, control distribution, and see who's installed your space. All of these need an org context — pass `--org <id>` or export `CONSTRUCT_ORG_ID`.

```bash
# Bundles (publisher-side grouping: kanban + kanban-admin)
construct graph bundles list
construct graph bundles create kanban-suite "Kanban Suite"
construct graph bundles show kanban-suite

# Spaces your org publishes (aliases: list, ls)
construct graph spaces                            # table: id, version, bundle, distribution, installs
construct graph spaces --bundle kanban-suite      # filter
construct graph spaces --json                     # scriptable

# Distribution — who may install this space
construct graph distribution kanban-admin private
construct graph distribution kanban public
construct graph distribution kanban-pro org_allowlist

# Allowlist (for org_allowlist-mode spaces)
construct graph allowlist add kanban-pro org-basecode
construct graph allowlist rm  kanban-pro org-basecode

# Install visibility — see who's installed your space
construct graph installs kanban
```

#### Tenant commands

```bash
# Install / uninstall a space for your org
construct graph install kanban
construct graph uninstall kanban                  # tenant data preserved
```

#### Manifest fields for bundles

To attach a space to a bundle, add these to `data.manifest.json`:

```json
{
  "version": 1,
  "bundle_id": "kanban-suite",
  "imports": [
    { "from": "kanban", "models": ["board", "card"] }
  ],
  "models": [ ... ]
}
```

`imports` lets a sibling space (like `kanban-admin`) reuse models from another space in the same bundle. Cross-bundle imports are rejected at publish.

See [`@construct-space/graph` README](https://github.com/construct-space/graph-sdk#space-bundles) for the full bundles story.

#### Field Types

| Type | Example |
|------|---------|
| `string` | `name:string` |
| `int` | `age:int` |
| `number` | `price:number` |
| `boolean` | `active:boolean` |
| `date` | `createdAt:date` |
| `json` | `metadata:json` |
| `enum` | `status:enum:draft,published,archived` |

#### Modifiers

Chain modifiers with `:` — `email:string:required:unique`

| Modifier | Effect |
|----------|--------|
| `required` | Field must have a value |
| `unique` | Unique constraint |
| `index` | Database index |
| `email` | Email validation |
| `url` | URL validation |

#### Relations

```bash
construct graph g Comment body:string post:belongsTo:Post
construct graph g Post title:string comments:hasMany:Comment
```

### Auth

```bash
construct login     # Authenticate via browser
construct logout    # Sign out
```

## License

MIT
