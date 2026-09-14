/*
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：在被测地址空间之外监督一个 Linux x86_64 用例入口与返回，独立 FD 3 写结果。
 */
#define _GNU_SOURCE
#include <sys/ptrace.h>
#include <linux/ptrace.h>
#include <linux/audit.h>
#include <sys/user.h>
#include <sys/wait.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <sys/stat.h>
#include <elf.h>
#include <fcntl.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>

static pid_t tracee = -1;
static int entered = 0;
static void finish(const char *reason, int returned, int value) {
  if (tracee > 0) { kill(tracee, SIGKILL); while (waitpid(tracee, NULL, 0) < 0 && errno == EINTR) {} }
  dprintf(3, "{\"entered\":%s,\"returned\":%s,\"value\":%d,\"reason\":\"%s\"}\n",
    entered ? "true" : "false", returned ? "true" : "false", value, reason);
  exit(0);
}
static long peek(unsigned long address) {
  errno = 0;
  long word = ptrace(PTRACE_PEEKDATA, tracee, (void *)address, NULL);
  if (errno) finish("SUPERVISOR_PEEK_FAILED", 0, 0);
  return word;
}
static void poke(unsigned long address, long word) {
  if (ptrace(PTRACE_POKEDATA, tracee, (void *)address, (void *)word) < 0) finish("SUPERVISOR_POKE_FAILED", 0, 0);
}
static int readonly_flags(unsigned long long flags) {
  return (flags & O_ACCMODE) == O_RDONLY && !(flags & (O_CREAT | O_TRUNC | O_APPEND)) && (flags & O_TMPFILE) != O_TMPFILE;
}
/* No child writes to files, supervision channels or other processes. Unknown calls fail closed. */
static int allowed(const struct ptrace_syscall_info *call) {
  const __u64 *a = call->entry.args;
  if (call->arch != AUDIT_ARCH_X86_64) return 0;
  switch (call->entry.nr) {
    case SYS_kill: case SYS_tkill: return a[0] == (__u64)tracee;
    case SYS_tgkill: return a[0] == (__u64)tracee && a[1] == (__u64)tracee;
    case SYS_write: case SYS_writev: return a[0] == 1 || a[0] == 2;
    case SYS_open: return readonly_flags(a[1]);
    case SYS_openat: return readonly_flags(a[2]);
    case SYS_fcntl: return a[1] == F_GETFD || a[1] == F_GETFL;
    case SYS_prlimit64: return a[0] == 0 && a[2] == 0;
    case SYS_ioctl: return a[1] == 0x5401 || a[1] == 0x5413; /* TCGETS / TIOCGWINSZ */
    case SYS_read: case SYS_pread64: case SYS_close: case SYS_fstat: case SYS_stat:
    case SYS_lstat: case SYS_newfstatat: case SYS_statx: case SYS_access: case SYS_faccessat:
    case SYS_lseek: case SYS_getdents64: case SYS_getcwd: case SYS_readlink: case SYS_readlinkat:
    case SYS_mmap: case SYS_mprotect: case SYS_munmap: case SYS_brk: case SYS_madvise:
    case SYS_arch_prctl: case SYS_set_tid_address: case SYS_set_robust_list: case SYS_rseq:
    case SYS_rt_sigaction: case SYS_rt_sigprocmask: case SYS_rt_sigreturn: case SYS_sigaltstack:
    case SYS_futex: case SYS_getpid: case SYS_getppid: case SYS_gettid: case SYS_getuid:
    case SYS_geteuid: case SYS_getgid: case SYS_getegid: case SYS_getrandom: case SYS_uname:
    case SYS_clock_gettime: case SYS_gettimeofday: case SYS_time: case SYS_nanosleep:
    case SYS_clock_nanosleep: case SYS_sched_yield: return 1;
    default: return 0;
  }
}
static unsigned long load_bias(const char *binary) {
  Elf64_Ehdr header;
  FILE *file = fopen(binary, "rb");
  if (!file || fread(&header, 1, sizeof(header), file) != sizeof(header)) finish("SUPERVISOR_ELF_INVALID", 0, 0);
  fclose(file);
  if (memcmp(header.e_ident, ELFMAG, SELFMAG) || header.e_machine != EM_X86_64) finish("SUPERVISOR_ELF_INVALID", 0, 0);
  if (header.e_type == ET_EXEC) return 0;
  if (header.e_type != ET_DYN) finish("SUPERVISOR_ELF_INVALID", 0, 0);
  struct stat st; if (stat(binary, &st)) finish("SUPERVISOR_ELF_INVALID", 0, 0);
  char path[64], line[8192]; snprintf(path, sizeof(path), "/proc/%d/maps", tracee);
  file = fopen(path, "r"); if (!file) finish("SUPERVISOR_MAPS_UNAVAILABLE", 0, 0);
  while (fgets(line, sizeof(line), file)) {
    unsigned long start, end, offset, inode; char permissions[8], device[32];
    if (sscanf(line, "%lx-%lx %7s %lx %31s %lu", &start, &end, permissions, &offset, device, &inode) == 6
        && offset == 0 && inode == st.st_ino && strstr(line, binary)) { fclose(file); return start; }
  }
  fclose(file); finish("SUPERVISOR_MAPS_UNAVAILABLE", 0, 0); return 0;
}
int main(int argc, char **argv) {
  if (argc < 4) finish("SUPERVISOR_ARGUMENT_INVALID", 0, 0);
  if (prctl(PR_SET_DUMPABLE, 0L) || prctl(PR_SET_NO_NEW_PRIVS, 1L, 0L, 0L, 0L)) finish("SUPERVISOR_PROTECTION_UNAVAILABLE", 0, 0);
  tracee = fork();
  if (tracee < 0) finish("SUPERVISOR_FORK_FAILED", 0, 0);
  if (tracee == 0) {
    /* Only logs survive exec. FD 3 belongs exclusively to the supervisor. */
    for (int fd = 3; fd < 1024; fd++) close(fd);
    prctl(PR_SET_PDEATHSIG, SIGKILL);
    if (ptrace(PTRACE_TRACEME, 0, NULL, NULL) < 0) _exit(125);
    char **arguments = calloc((size_t)argc, sizeof(char *));
    if (!arguments) _exit(125);
    arguments[0] = argv[1];
    for (int i = 3; i < argc; i++) arguments[i - 2] = argv[i];
    execv(argv[1], arguments); _exit(125);
  }
  int status;
  if (waitpid(tracee, &status, 0) < 0 || !WIFSTOPPED(status) || WSTOPSIG(status) != SIGTRAP)
    finish("SUPERVISOR_ATTACH_FAILED", 0, 0);
  if (ptrace(PTRACE_SETOPTIONS, tracee, NULL, (void *)(PTRACE_O_TRACESYSGOOD | PTRACE_O_EXITKILL)) < 0)
    finish("SUPERVISOR_OPTIONS_FAILED", 0, 0);
  unsigned long entry = strtoul(argv[2], NULL, 16) + load_bias(argv[1]);
  long entry_word = peek(entry); poke(entry, (entry_word & ~0xffL) | 0xcc);
  unsigned long completion = 0;
  for (;;) {
    if (ptrace(PTRACE_SYSCALL, tracee, NULL, NULL) < 0) finish("SUPERVISOR_CONTINUE_FAILED", 0, 0);
    if (waitpid(tracee, &status, 0) < 0) finish("SUPERVISOR_WAIT_FAILED", 0, 0);
    if (!WIFSTOPPED(status)) finish("EXIT_BEFORE_RETURN", 0, 0);
    int sig = WSTOPSIG(status);
    if (sig == (SIGTRAP | 0x80)) {
      struct ptrace_syscall_info call;
      memset(&call, 0, sizeof(call));
      if (ptrace(PTRACE_GET_SYSCALL_INFO, tracee, sizeof(call), &call) < 0) finish("SUPERVISOR_SYSCALL_INFO_UNAVAILABLE", 0, 0);
      if (call.op == PTRACE_SYSCALL_INFO_ENTRY) {
        if (call.arch == AUDIT_ARCH_X86_64 && (call.entry.nr == SYS_exit || call.entry.nr == SYS_exit_group))
          finish("EXIT_BEFORE_RETURN", 0, 0);
        if (!allowed(&call)) { fprintf(stderr, "SUPERVISOR_DENIED_SYSCALL %llu\n", (unsigned long long)call.entry.nr); finish("DENIED_SYSCALL", 0, 0); }
      }
      continue;
    }
    if (sig != SIGTRAP) finish("SIGNAL_BEFORE_RETURN", 0, 0);
    struct user_regs_struct regs;
    if (ptrace(PTRACE_GETREGS, tracee, NULL, &regs) < 0) finish("SUPERVISOR_REGISTERS_FAILED", 0, 0);
    if (!entered && regs.rip == entry + 1) {
      entered = 1; poke(entry, entry_word); regs.rip = entry;
      completion = (unsigned long)peek(regs.rsp);
      long word = peek(completion); poke(completion, (word & ~0xffL) | 0xcc);
      if (ptrace(PTRACE_SETREGS, tracee, NULL, &regs) < 0) finish("SUPERVISOR_REGISTERS_FAILED", 0, 0);
    } else if (entered && regs.rip == completion + 1) {
      finish("RETURNED", 1, (int)(uint32_t)regs.rax);
    } else finish("UNEXPECTED_TRAP", 0, 0);
  }
}
