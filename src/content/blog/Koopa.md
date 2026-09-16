---
title: Koopa IR 人话版
publishDate: 2025-01-14 00:09:26
description: '我说为什么写 lab 这么慢，原来我们是乌龟。'
tags:
  - 编译原理
  - PKU
language: '中文'
---

## 切片 `Slice`

`slice` 是存储一系列元素的数组。具体来说，`koopa_raw_slice_t` 是一个结构体，用于表示一个元素数组及其长度。其定义如下：

```c
typedef struct {
  // 数组指针
  const void **buffer;
  // 数组长度
  uint32_t len;
  // 数组中元素的类型
  koopa_raw_slice_item_kind_t kind;
} koopa_raw_slice_t;
```

- `buffer`：指向元素数组的指针。数组中的每个元素都是 `const void *` 类型，这意味着它可以指向任何类型的对象。
- `len`：数组的长度，即数组中元素的数量。
- `kind`：数组中元素的类型，用 `koopa_raw_slice_item_kind_t` 枚举类型表示，可以是类型、函数、基本块或值等。

## 基本块 `Basic Block`

`basic block` 就是一系列的指令集合，在其内逻辑流不会发生跳转。

> 需要注意的是，基本块的结尾必须是 `br`，`jump` 或 `ret` 指令其中之一 (并且，这些指令只能出现在基本块的结尾)。也就是说，即使两个基本块是相邻的，例如上述程序的 `%else` 基本块和 `%end` 基本块，如果你想表达执行完前者之后执行后者的语义，你也必须在前者基本块的结尾添加一条目标为后者的 `jump` 指令。这点和汇编语言中 label 的概念有所不同。

比如一段代码：

```c
int main() {
  int b = 1;
  if (b == 1) {
    return 1;
  }
  else {
    return 2;
  }
}
```

其被翻译为如下的 KoopaIR：

```asm
fun @main(): i32 {
%main_entry:
	@b_2 = alloc i32
	store 1, @b_2
	%0 = load @b_2
	%1 = eq %0, 1
	br %1, %then_0, %else_0
%then_0:
	ret 1
%jump_0:
	jump %end_0
%else_0:
	ret 2
%jump_1:
	jump %end_0
%end_0:
	ret 0
}
```

这里，每个标号分开的区域就是一个基本块。

## 值 `value`

`value` 对应 `koopa_raw_value_t` 类型，表示指向一个值的指针，多数情况下，你可以认为它是一个指令的相关信息，因为我们知道，在 KoopaIR 中是静态单赋值，它总是类似下面这种只赋值一次的指令：

```asm
@b_2 = alloc i32
store 1, @b_2
@c_2 = alloc i32
store 2, @c_2
@d_2 = alloc i32
store 3, @d_2
@e_2 = alloc i32
store 4, @e_2
%0 = load @b_2
%1 = load @c_2
%2 = add %0, %1
%3 = load @d_2
%4 = add %2, %3
%5 = load @e_2
%6 = add %4, %5
ret %6
```

所以，这里你会发现，大多数指令就是一个 **值**，他们总是引用了一些别的值，做了一些事情。

比如，`%0 = load @b_2`，就会引用两个值，一个是 `@b_2`，另一个是 `%0`。

这些引用的值记作这个 `value` 的 `data`，根据操作的不同，其会有不同的字段，比如对于 `load` 指令，你需要如下访问到他的 data：

```c
value->kind.data.load
```

它会有两个属性：

- `src`：代表被加载的值
- `dest`：代表存放加载结果的值

这两者类型也都为 `koopa_raw_value_t`。

`value` 所谓的这个值也可以是代表 KoopaIR 中用到的一些“东西”，如 `interger` 代表一个数，又如 `aggregate` 代表一个初始化列表。其的定义链如下：

```c
typedef const koopa_raw_value_data_t *koopa_raw_value_t;
typedef struct koopa_raw_value_data koopa_raw_value_data_t;
```

所以，对其解引用后就会得到 `koopa_raw_value_data` 类型，其定义如下：

```c
struct koopa_raw_value_data {
  // 值的静态类型
  koopa_raw_type_t ty;
  // 值的名称
  const char *name;
  // 值被哪些值使用
  koopa_raw_slice_t used_by;
  // 值的具体种类，代表值的动态行为
  koopa_raw_value_kind_t kind;
};
```

- `ty`：值的类型信息，用于描述值的静态类型，对应 `koopa_raw_type_t` 类型，一个值可以是 `int32`、`pointer`、`function` 等。
- `name`：值的名称，如 `@a_0`，`@main` 等，只对 `func` 和 `alloc` 指令有意义。
- `used_by`：值被哪些值使用，对应 `koopa_raw_slice_t` 类型，表示值被哪些指令使用。
- `kind`：值的类型和依赖关系，用于描述值的动态行为，对应 `koopa_raw_value_kind_t` 类型，表示指令的类型，如 `integer`，`aggregate` 等。

```c
typedef struct {
  koopa_raw_value_tag_t tag;
  union {
    koopa_raw_integer_t integer;
    koopa_raw_aggregate_t aggregate;
    koopa_raw_func_arg_ref_t func_arg_ref;
    koopa_raw_block_arg_ref_t block_arg_ref;
    koopa_raw_global_alloc_t global_alloc;
    koopa_raw_load_t load;
    koopa_raw_store_t store;
    koopa_raw_get_ptr_t get_ptr;
    koopa_raw_get_elem_ptr_t get_elem_ptr;
    koopa_raw_binary_t binary;
    koopa_raw_branch_t branch;
    koopa_raw_jump_t jump;
    koopa_raw_call_t call;
    koopa_raw_return_t ret;
  } data;
} koopa_raw_value_kind_t;
```

- `tag`：值的种类，对应 `koopa_raw_value_tag_t` 枚举类型。
- `data`：值的具体数据，根据 `tag` 的不同，有不同的结构体。如上文所说的 `load` 指令，其 `tag` 为 `KOOPA_RVT_LOAD`，其 `data` 为 `koopa_raw_load_t` 类型，而 `koopa_raw_load_t` 又会有 `load` 指令所需的 `src` 和 `dest` 两个指令字面字段。

### 类型 `type`

类型 `type` 对应 `koopa_raw_type_t` 类型，表示指向一个 `koopa_raw_type_kind_t` 类型的指针，用于描述值的静态类型，一个值可以是 `int32`、`pointer`、`function` 等。

```c
typedef const koopa_raw_type_kind_t *koopa_raw_type_t;
typedef struct koopa_raw_type_kind {
  koopa_raw_type_tag_t tag;
  union {
    struct {
      const struct koopa_raw_type_kind *base;
      size_t len;
    } array;
    struct {
      const struct koopa_raw_type_kind *base;
    } pointer;
    struct {
      koopa_raw_slice_t params;
      const struct koopa_raw_type_kind *ret;
    } function;
  } data;
} koopa_raw_type_kind_t;
```

- `tag`：类型标签，表示类型的种类，对应 `koopa_raw_type_tag_t` 枚举类型。
- `data`：类型数据，根据 `tag` 的不同，有不同的结构体，也可能没有数据只是分配了空间。

```c
typedef enum {
  // 32 位整数
  KOOPA_RTT_INT32,
  // 空类型
  KOOPA_RTT_UNIT,
  // 数组
  KOOPA_RTT_ARRAY,
  // 指针
  KOOPA_RTT_POINTER,
  // 函数
  KOOPA_RTT_FUNCTION,
} koopa_raw_type_tag_t;
```

### 初始化列表 `aggregate`

一个数组：

```c
int a[2][2] = {1, 2, 3, 4};
```

会被 KoopaIR 翻译为：

```c
global @a_0 = alloc [[i32, 2], 2], {{1, 2}, {3, 4}}
```

那么 `{{1, 2}, {3, 4}}` 就是一个 `aggregate`，它的元素是两个 `aggregate`，即 `{1, 2}` 和 `{3, 4}`，其中每个 `aggregate` 的元素是两个 `integer`。

### 指针 `get_ptr` / `get_elem_ptr`

若一个 `value` 的 `kind.tag` 为 `KOOPA_RVT_GET_PTR` 或 `KOOPA_RVT_GET_ELEM_PTR`，则其 `kind.data` 为 `koopa_raw_get_ptr_t` 或 `koopa_raw_get_elem_ptr_t`，里面存放了值的依赖关系：

```c
typedef struct {
  // 源
  koopa_raw_value_t src;
  // 索引
  koopa_raw_value_t index;
} koopa_raw_get_ptr_t;

typedef struct {
  // 源
  koopa_raw_value_t src;
  // 索引
  koopa_raw_value_t index;
} koopa_raw_get_elem_ptr_t;
```

举例说明，对于指令：

```asm
%0 = get_ptr @a_0, 1
%0 = get_elem_ptr @a_0, 1
```

- `@a_0` 是 `src`
- `1` 是 `index`

那么，有时候我们还会想要获得指针所指向范围的大小，那么我们就可以使用 `get_alloc_size` 函数。

```c
int get_alloc_size(const koopa_raw_type_t ty) {
    switch (ty->tag) {
        // 空类型不占用空间
    case KOOPA_RTT_UNIT:
        return 0;
        // 函数类型不占用空间
    case KOOPA_RTT_FUNCTION:
        return 0;
        // 32 位整数占用 4 字节
    case KOOPA_RTT_INT32:
        return 4;
        // 指针类型占用 4 字节
    case KOOPA_RTT_POINTER:
        return 4;
        // 数组类型占用空间为数组长度乘以数组元素类型占用空间
    case KOOPA_RTT_ARRAY:
        return ty->data.array.len * get_alloc_size(ty->data.array.base);
    default:
        printf("Invalid type: %s\n", koopaRawTypeTagToString(ty->tag).c_str());
        assert(false);
    }
}
```

- 对于一个 `value.kind.tag = KOOPA_RVT_GET_PTR` 的 `value`，我们使用 `get_alloc_size(value.kind.data.get_ptr.src->ty->data.pointer.base)` 来获得指针的步长
- 对于一个 `value.kind.tag = KOOPA_RVT_GET_ELEM_PTR` 的 `value`，我们使用 `get_alloc_size(value.kind.data.get_elem_ptr.src->ty->data.pointer.base)` 来获得指针的步长

一时间也想不到什么很好的说法来通俗的说明...
