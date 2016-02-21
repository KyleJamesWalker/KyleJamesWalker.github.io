---
layout: page-fullwidth
title: "Luigi OpenerTarget"
subheadline: "A new and flexible target"
teaser: |
  Luigi's targets are a great abstraction, but lacking the ability to easily
  re-configure your tasks for different environments.
header: no
categories:
  - programming
tags:
  - programming
---

*Note*: This is currently a proposed PR against luigi

Target types are often used directly in the output function, as shown below:

{% highlight python linenos %}
import luigi

class StaticTask(luigi.Task):
    def run(self):
        payload = {'foo': 'bar'}
        with self.output().open('w') as fp:
            json.dump(payload, fp)

    def output(self):
        return luigi.s3.S3Target(s3://foo/bar/baz.txt)
{% endhighlight %}

This is fine, but then you either need to mock the S3Target, or create a new
class that inherits from StaticTask, and overrides the output with a
MockTarget within your unit tests or during runs in local development. Another
direction could be to add a luigi parameter to the task, and add logic to the
output to select from a list of expected targets, but this still isn't quite as
flexible as one might like.

The OpenerTarget attempts to help alleviate this limitation. The example below
allow shows the pattern used it most luigi tasks, but allows the task to be run
against the local file system, mock file system, s3 file system, and many
others including registration of custom target types.

{% highlight python linenos %}
import luigi

from luigi.contrib.opener import OpenerTarget

class ConfigurableTask(luigi.Task):
    output_file = luigi.parameter(default='s3://foo/bar/baz.txt')

    def run(self):
        payload = {'foo': 'bar'}
        with self.output().open('w') as fp:
            json.dump(payload, fp)

    def output(self):
        return OpenerTarget(self.output_file)
{% endhighlight %}

With this pattern, the task can be reconfigured by simply setting the parameter
to a different target supported by the opener registry.
