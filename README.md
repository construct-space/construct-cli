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
```

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
