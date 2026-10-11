from pyspark.sql import SparkSession


def create_spark(app_name: str, master: str = "local[2]") -> SparkSession:
    """Spark session tuned for small, frequent micro-batches on a single machine.

    Measured on the streaming handler (see docs/analytics.md): with tiny batches, fixed
    per-job overhead dominates, so
    - shuffle partitions match the local cores instead of the default 200, and
    - adaptive query execution is off: its re-planning costs more than it saves here.
    Together these cut a warm micro-batch from ~8.3 s to ~5.5 s.
    """
    cores = master.removeprefix("local[").removesuffix("]")
    shuffle_partitions = cores if cores.isdigit() else "2"
    return (
        SparkSession.builder.appName(app_name)
        .master(master)
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.sql.shuffle.partitions", shuffle_partitions)
        .config("spark.sql.adaptive.enabled", "false")
        .config("spark.ui.showConsoleProgress", "false")
        .getOrCreate()
    )
