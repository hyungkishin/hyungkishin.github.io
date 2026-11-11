from pathlib import Path
import subprocess
import shutil
import tempfile
import time

here = Path(__file__).resolve().parent
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)

    def run(*args, ok=True):
        print('$', ' '.join(str(a) for a in args).replace(str(root), '.'), flush=True)
        result = subprocess.run(args, cwd=root, capture_output=True, text=True, timeout=20)
        if ok != (result.returncode == 0):
            raise RuntimeError(result.stdout + result.stderr)
        return (result.stdout + result.stderr).strip()

    def write(path, source):
        out = root / path
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(source)

    write('v1/plug/Entry.java', 'package plug; public class Entry { public static String text() { return "v1"; } }')
    write('v2/plug/Entry.java', 'package plug; public class Entry { public static int text() { return 2; } }')
    write('Caller.java', '''public class Caller {
        public static void main(String[] args) throws Exception {
            if (args.length != 0) Class.forName("plug.Entry");
            else System.out.println(plug.Entry.text());
        }
    }''')
    print(run('java', '-version'))
    for edition in ('v1', 'v2'):
        run('javac', '-d', edition, edition + '/plug/Entry.java')
        run('jar', '--create', '--file', edition + '.jar', '-C', edition, 'plug/Entry.class')
    print(run('jar', 'tf', 'v1.jar'))
    shutil.copyfile(here / 'LoaderLab.java', root / 'LoaderLab.java')
    run('javac', '-cp', 'v1.jar', '-d', 'app', 'Caller.java', 'LoaderLab.java')
    dump = run('javap', '-v', '-c', '-cp', 'app', 'Caller')
    print('\n'.join(row for row in dump.splitlines() if 'plug/Entry.text' in row))
    for args, ok in [(('app:v1.jar', 'Caller'), True), (('app', 'Caller', 'reflect'), False),
                     (('app', 'Caller'), False), (('app:v2.jar', 'Caller'), False)]:
        print(run('java', '-cp', *args, ok=ok))
    loaded = run('java', '-Xlog:class+load=info', '-cp', 'app:v1.jar', 'Caller')
    print('\n'.join(line.replace(str(root.resolve()), '<lab>').replace(str(root), '<lab>') for line in loaded.splitlines() if 'plug.Entry source:' in line))
    for args in [('chain',), ('initialization',), ('identity', 'v1.jar'), ('unload', 'v1.jar')]:
        print(run('java', '-Xmx48m', '-XX:+UseG1GC', '-Xlog:class+unload=info', '-cp', 'app', 'LoaderLab', *args))

    print('$ java -cp app LoaderLab cycle')
    with subprocess.Popen(['java', '-cp', 'app', 'LoaderLab', 'cycle'], cwd=root, stdin=subprocess.PIPE,
                          stdout=subprocess.PIPE, text=True) as child:
        try:
            print(child.stdout.readline().strip())
            deadline = time.monotonic() + 10
            while True:
                dump = run('jcmd', str(child.pid), 'Thread.print')
                relevant = [line for line in dump.splitlines() if line.startswith(('"init-A"', '"init-B"'))
                            or 'waiting on the Class initialization monitor for LoaderLab$' in line]
                if sum('initialization monitor' in line for line in relevant) == 2:
                    print('\n'.join(relevant))
                    break
                if time.monotonic() >= deadline:
                    raise RuntimeError('two waiting initializers absent from thread dump')
        finally:
            child.stdin.close()
            child.wait(timeout=5)
